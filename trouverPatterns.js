/*----------------------------------
- DEPENDANCES
----------------------------------*/
const https = require('https');
const { Worker } = require('worker_threads')

var TimSort = require('timsort');
const fs = require('fs-extra');
const path = require('path');

const { creerWorker, creerWorkerAvecBulks } = require('./libs/outils/creerWorker');

const { checkSimilaritePatterns } = require('./libs/checkSimilarite');

/*----------------------------------
- CONFIG
----------------------------------*/
const {
    dateMin, taillePattern, minSimilarites,

    food: { dossierFood, getDossierDatasets },
    datasets: { nbWorkersChargementDatasets, nbDatasetsParWorker },
    calculs: { nbWorkersSimilarites, nbResultatsMaxGroupe },
    resultats: { getFichierResultats, getCheminResultats },
    paramsA: { echelle, paire }
} = require('./libs/config');

/*----------------------------------
- RÉFÉRENCEMENT FICHIERS A LIRE
----------------------------------*/
async function getFichiersDatasets() {

    let fichiersDatasets = [];

    const exchanges = fs.readdirSync( getDossierDatasets(paire, echelle) );
    for (const iExchange in exchanges) {

        const exchange = exchanges[ iExchange ];

        const dossierSets = getDossierDatasets(paire, echelle, exchange);
        const sets = fs.readdirSync( dossierSets );
        for (const iSet in sets) {

            const set = sets[ iSet ];

            if (!set.endsWith('.json'))
                continue;

            fichiersDatasets.push(dossierSets + set);

        }
    }

    return fichiersDatasets;
}


/*----------------------------------
- CHARGEMENT & MÉLANGE DONNÉES
----------------------------------*/
async function chargerDonnees() {

    // Cache
    const cacheDatasets = getCheminResultats(paire, echelle) + '/datasets.json';
    if (fs.existsSync(cacheDatasets)) {
        console.log("Chargement des groupes datasets depuis le cache ...");
        return fs.readJsonSync(cacheDatasets);
    }

    // Fichiers datasets
    let fichiersDatasets = await getFichiersDatasets();
    const nbFichiersDatasets = fichiersDatasets.length;

    // Progression
    let workersLecture = {};
    let progressionAlecture = -1;
    let nbFichiersLus = 0;

    // Sortie
    let datasets = {};
    let valeurs = [];
    let nbValeurs = 0;

    function chargerDatasets(nouveauxDatasets) {

        // 1 fichier = 1 dataset
        for (iDataset in nouveauxDatasets.datasets) {

            const dataset = nouveauxDatasets.datasets[ iDataset ];
            const nbValsDataset = dataset.nbVals;

            datasets[ iDataset ] = dataset;

            // Référencement des valeurs (on garde la trace de l'id unique du dataset)
            for (let iDonnee = 0; iDonnee < nbValsDataset; iDonnee++) {
                valeurs.push(dataset.vals[ iDonnee ]);
            }

            // On ne garde que les métasdonnées (exchange, ...)
            delete datasets[ iDataset ].vals;

            nbValeurs += nbValsDataset;
            nbFichiersLus++;
        }

        const progression = Math.floor(nbFichiersLus / nbFichiersDatasets * 100);
        if (progression !== progressionAlecture) {

            progressionAlecture = progression;

            console.log('Lecture datasets: ' + nbFichiersLus + ' / ' + nbFichiersDatasets + ' | ' + progression + ' % | '+ nbValeurs + ' valeurs au total');
        }
    }

    await creerWorkerAvecBulks({
        source: './libs/workers/lectureDatasets.js',
        nom: 'Lecture datasets',
        input: (bulkA) => {

            // Plus de fichiers a traiter
            if (fichiersDatasets.length === 0)
                return false;

            let fichiersWorker = [];
            for (let iFichier = 0; iFichier <= nbDatasetsParWorker; iFichier++) {

                const fichier = fichiersDatasets.shift();
                if (fichier === undefined) // Plus de fichier à traiter
                    break;

                fichiersWorker.push({ fichier, iDataset: iFichier });
            }

            if (fichiersWorker.length === 0)
                return false;

            return {
                fichiersDatasets: fichiersWorker
            }

        },
        output: (donnees) => {

            chargerDatasets(donnees);

        },
        bulk: {
            workers: workersLecture,
            nbWorkersParBulk: nbWorkersChargementDatasets
        }
    });

    const retour = { valeurs, nbValeurs, datasets, nbDatasets: nbFichiersLus };
    fs.outputJsonSync(cacheDatasets, retour);
    return retour;
}

/*----------------------------------
- CALCUL
----------------------------------*/
function getGroupesValsRef(nbValeurs) {

    let groupesValsRef = [];
    let iDebutRef = 0;
    let nbValsRef = 10000;
    const iMax = nbValeurs - 1;
    const tailleCroisement = taillePattern.min; // Evite de louper un pattern qui pourrait se trouver entre deux groupes de valeur

    while (iDebutRef < iMax) {

        let iFinRef = iDebutRef + nbValsRef;
        if (iFinRef > iMax)
            iFinRef = iMax;

        groupesValsRef.push([ iDebutRef, iFinRef ]);

        iDebutRef += nbValsRef - tailleCroisement;
    }

    return groupesValsRef;
}

function chargerAvancementCalculs(groupesValsRef) {

    const dossierResultats = getCheminResultats(paire, echelle);
    let fichiersResultats = fs.readdirSync( dossierResultats ).filter(
        (f) => f.startsWith('groupe')
    );

    // Résultats
    let nbTotalResultats = 0;
    let groupesResultats = { 0: {} }; // Groupe traitement => Taille => Groupes

    // Avancement
    let iGroupeResultats = 0; // Pour init
    let nbWorkersOk = 0;

    let iWorker = 0; // = Aucun worker terminé

    console.log(`Chargement des résultats précédents depuis ${fichiersResultats.length} fichiers ...`);
    for (fichier of fichiersResultats) {

        const resultatsFichier = fs.readJsonSync(dossierResultats + '/' + fichier);

        // Informations avancement
        if (resultatsFichier.avancement.nbTotalResultats > nbTotalResultats)
            nbTotalResultats = resultatsFichier.avancement.nbTotalResultats;

        // Groupe de résultats actuel
        if (resultatsFichier.avancement.iGroupeResultats > iGroupeResultats) {
            iGroupeResultats = resultatsFichier.avancement.iGroupeResultats;

            // Init
            groupesResultats[ iGroupeResultats ] = {};
        }

        // Nombre workers terminés
        if (resultatsFichier.avancement.nbWorkersOk > nbWorkersOk)
            nbWorkersOk = resultatsFichier.avancement.nbWorkersOk;

        // Nombre workers terminés
        if (resultatsFichier.avancement.iWorker > iWorker)
            iWorker = resultatsFichier.avancement.iWorker;

        // Résultats
        for (tPattern in resultatsFichier.resultats) {

            // Init taille
            if (groupesResultats[ iGroupeResultats ][tPattern] === undefined)
                groupesResultats[ iGroupeResultats ][tPattern] = [];

            // Incrémentation résultats
            for (resultat of resultatsFichier.resultats[ tPattern ]) {
                groupesResultats[ iGroupeResultats ][tPattern].push( resultat );
                nbTotalResultats++;
            }
        }
    }

    // Vire les groupes de valeurs référentes ayant déjà été traitées
    for (let iWorkerA = 0; iWorkerA < nbWorkersOk; iWorkerA++)
        groupesValsRef.shift();

    // toutes les valeurs référente sont été traitées
    if (groupesValsRef.length === 0) {

        console.log(`Calculs terminés, ${nbTotalResultats} résultats.`);

        // Fusion des groupes de résultats
        let resultatsLisses = {};
        for (let iGroupe in groupesResultats) {
            const groupe = groupesResultats[ iGroupe ];

            for (let tPattern in groupe) {

                if (resultatsLisses[ tPattern ] === undefined)
                    resultatsLisses[ tPattern ] = [];

                for (let resultat of groupe[tPattern])
                    resultatsLisses[ tPattern ].push( resultat );

            }
        }

        return {
            termine: true,
            groupesResultats: resultatsLisses,
            nbTotalResultats
        }
    } else {

        console.log(`Reprise des calculs depuis le worker ${iWorker} ...`);

        return {
            termine: false,
            nbTotalResultats, groupesResultats: groupesResultats[ iGroupeResultats ] || {},
            iGroupeResultats, nbWorkersOk,
            groupesValsRef,
            iWorkerA: iWorker
        };
    }
}

// datasets contient la liste des datasets, chacun étant enrichis par
async function croiserPatterns(valeurs, nbValeurs, datasets, nbDatasets) {

    // Création groupes données ref
    const groupesValsRef1 = getGroupesValsRef(nbValeurs);
    const nbWorkersRequis = groupesValsRef1.length;

    // Chargement avancement
    let {
        termine,
        nbTotalResultats, groupesResultats,
        iGroupeResultats, nbWorkersOk,
        groupesValsRef,
        iWorkerA
    } = chargerAvancementCalculs(groupesValsRef1);

    if (termine)
        return { groupesResultats, nbTotalResultats };

    // Progression
    let workersPatterns = {};

    // Groupe résultats
    let nbResultatsGroupe = 0;

    let iWorkerEnregistre = -1;
    const enregistrerResultats = (iWorker) => {

        if (iWorker > iWorkerEnregistre)
            iWorkerEnregistre = iWorker;

        const fichier = getFichierResultats(paire, echelle, iGroupeResultats);

        return fs.outputJsonSync(
            fichier, {
                resultats: groupesResultats,
                avancement: {
                    nbTotalResultats,
                    iGroupeResultats, // Numéro du groupe de résultats actuel
                    iWorker: iWorkerEnregistre, // Le worker le plus récent enregistré
                    nbWorkersOk, // Répère à quel groupe de valeurs reprendre

                    // Vérification intégrité
                    nbWorkersRequis
                }
            }
        );
    };

    await creerWorkerAvecBulks({
        source: './libs/workers/recherchePatterns.js',
        nom: 'Recherche patterns',
        input: () => {

            const valsRef = groupesValsRef.shift();

            if (valsRef === undefined)
                return false;

            const [iDebutRef, iFinRef] = valsRef;

            return { iDebutRef, iFinRef, paire, echelle }
        },
        prefixeDebug: (iWorker, input) => {
            const progression = Math.floor(nbWorkersOk / nbWorkersRequis * 100);
            return `Sims ok: ${nbTotalResultats} | ${nbWorkersOk} / ${nbWorkersRequis} | ${progression}% | Worker ${iWorker}`;// | iDebutRef: ${input.iDebutRef} | iFinRef: ${input.iFinRef}`;
        },
        output: (donnees, iWorker, input) => {

            console.log(`Fin du worker ${iWorker} pour les valeurs de ${input.iDebutRef} à ${input.iFinRef}.`);

            nbWorkersOk++;

            nbTotalResultats += donnees.nbResultats;

            // Pour chaque similarité trouvée
            for (tPatternA in donnees.resultats) {

                if (groupesResultats[ tPatternA ] === undefined)
                    groupesResultats[ tPatternA ] = [];

                const resultatsTaille = donnees.resultats[tPatternA];
                const nbGroupesTaille = resultatsTaille.length;

                for (let iGroupeRef = 0; iGroupeRef < nbGroupesTaille; iGroupeRef++) {

                    // Infos groupe référence
                    const groupeRef = resultatsTaille[ iGroupeRef ];

                    // Si limite de résultats atteinte pour le group actuel
                    if (nbResultatsGroupe >= nbResultatsMaxGroupe) {

                        console.log(`Changement de groupe de résultats ...`)

                        // Enregisrement
                        enregistrerResultats(iWorker);

                        // Changement de groupe
                        iGroupeResultats++;
                        nbResultatsGroupe = 0;
                        groupesResultats[ tPatternA ] = [];
                    }

                    nbResultatsGroupe++;

                    groupesResultats[ tPatternA ].push( groupeRef );

                }
            }

            enregistrerResultats(iWorker);
            console.log(`${donnees.nbResultats} résultats ont été ajoutés.`);
        },
        bulk: {
            workers: workersPatterns,
            iWorkerDebut: iWorkerA,
            nbWorkersParBulk: nbWorkersSimilarites
        }
    });

    return { groupesResultats, nbTotalResultats }
}

// Comparaison des patterns de chaque groupe de similarités avec ceux des résultats existants
// Si Similaires, fusion, sinon ajout simple
function fusionnerResultats(groupesResultats, valeurs) {

    let nbGroupesFusionnes = 0;
    let nbGroupesAjoutes = 0;

    let resultats = {}; // Taille => Groupes

    // Parcours taille pattern
    for (let tPatternA in groupesResultats) {

        tPatternA = parseInt(tPatternA); // Important pour checkSimilaritePatterns

        const nouveauxGroupes = groupesResultats[tPatternA];
        const nbNouveauxGroupes = nouveauxGroupes.length;

        if (resultats[tPatternA] === undefined)
            resultats[tPatternA] = [];

        // Parcours groupes
        itNouveauxGroupes:
        for (let iNouveauGroupe = 0; iNouveauGroupe < nbNouveauxGroupes; iNouveauGroupe++) {
            const nouveauGroupe = nouveauxGroupes[ iNouveauGroupe ];
            let fusionne = false; // Si le groupe a été fusionné dans un groupe dans les résultats existants

            console.log(`Fusion de ${nbNouveauxGroupes} résultats de taille ${tPatternA}: ${iNouveauGroupe + 1} / ${nbNouveauxGroupes}`);

            const groupesExistants = resultats[tPatternA];
            const nbGroupesExistants = resultats[ tPatternA ].length;

            itGroupesExistants:
            for (let iGroupeExistant = 0; iGroupeExistant < nbGroupesExistants; iGroupeExistant++) {
                const groupeExistant = groupesExistants[ iGroupeExistant ];

                // Parcours patterns
                for (let patternNouvGrp of nouveauGroupe.patterns) {
                    for (let patternGrpExistant of groupeExistant.patterns) {

                        if (checkSimilaritePatterns(
                            valeurs,
                            patternGrpExistant.vals,
                            valeurs,
                            patternNouvGrp.vals,

                            tPatternA, true
                        ) !== false) {

                            // Fusionne tout le group de référence dans le groupe de comparaison
                            for (pattern of nouveauGroupe.patterns) {
                                resultats[ tPatternA ][ iGroupeExistant ].patterns.push(pattern);
                            }

                            //delete nouveauxGroupes[ iNouveauGroupe ];

                            nbGroupesFusionnes++;

                            fusionne = true;
                            continue itGroupesExistants; // On passe au groupe suivant

                        }

                    }
                }
            }

            // Si on n'a pas trouvé de groupe similaire, on l'ajoute
            if (!fusionne) {
                resultats[ tPatternA ].push( nouveauGroupe );
                nbGroupesAjoutes++;
            }
        }
    }

    return resultats;
}

function verifDoublons(resultats) {
    for (let tPatternA in resultats) {
        const groupes = resultats[ tPatternA ];
        const nbGroupes = groupes.length;

        // Groupes
        for (let iGroupeRef = 0; iGroupeRef < nbGroupes; iGroupeRef++) {
            for (let iGroupeComp = iGroupeRef + 1; iGroupeComp < nbGroupes; iGroupeComp++) {

                let fusionner = false;

                // Patterns
                itPatternRef:
                for (let patternRef of groupes[ iGroupeRef ].patterns) {
                    for (let patternComp of groupes[ iGroupeComp ].patterns) {

                        // Comparaison
                        if (
                            patternRef.iDataset === patternComp.iDataset
                            &&
                            patternRef.vals === patternComp.vals
                        ) {
                            fusionner = true;
                            break itPatternRef;
                        }
                    }
                }

                if (fusionner) {

                    // Ajout des patterns du second groupe au premier groupe
                    /*for (let patternRef of groupes[ iGroupeComp ].patterns) {
                        groupes[ iGroupeComp ].patterns.push( patternRef );
                    }

                    // Suppression du doublon
                    delete resultats[ tPatternA ][ iGroupeComp ];*/

                    console.log('ALERTE DOUBLON');
                }
            }
        }
    }
}

function finaliser(groupesResultats, nbTotalResultats) {
    if (nbTotalResultats > 0) {

        console.log(`Applatissement, filtrage et calcul score de ${nbTotalResultats} resultats ...`);

        let resultats = [];

        for (tPatternA in groupesResultats) {
            for (iGroupe in groupesResultats[ tPatternA ]) {

                const groupe = groupesResultats[ tPatternA ][ iGroupe ];
                if (groupe.patterns.length < minSimilarites)
                    continue;

                groupe.score = Math.floor(tPatternA + groupe.patterns.length);

                resultats.push(groupe);

            }
        }

        console.log(`${resultats.length} groupes de résultats ont été conservés. Tri et enregistrement ...`);

        // tri par score
        TimSort.sort(resultats, ( a, b ) => {
            return b.score - a.score;
        });

        // Enregistrement
        fs.outputJsonSync( getFichierResultats(paire, echelle), resultats);
    }
}

;(async () => {

    // Chargement des datasets en groupes de 1000 données
    const { valeurs, nbValeurs, datasets, nbDatasets } = await chargerDonnees();

    let { groupesResultats, nbTotalResultats } = await croiserPatterns(valeurs, nbValeurs, datasets, nbDatasets);

    groupesResultats = fusionnerResultats(groupesResultats, valeurs);

    verifDoublons(groupesResultats);

    finaliser(groupesResultats, nbTotalResultats);

    console.log(`Terminé.`);

})();
