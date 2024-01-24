const { workerData, parentPort } = require('worker_threads')
const dayjs = require('dayjs');
const fs = require('fs-extra');

const { checkSimilaritePrix } = require('../checkSimilarite');

const debug = true;

/*----------------------------------
- CONFIG
----------------------------------*/
let { iDebutRef, iFinRef, paire, echelle } = workerData;

const { taillePattern, resultats: { getCheminResultats } } = require('../config');

const log = (txt) => debug && parentPort.postMessage(txt);

function msToStr(ms) {
    x = ms / 1000;
    seconds = Math.round(x % 60);
    x /= 60;
    minutes = Math.round(x % 60);
    x /= 60;
    hours = Math.round(x % 24);
    x /= 24;
    days = Math.round(x);

    return days + "j " + hours + "h " + minutes + "m " + seconds + "s";
}

const NS_PER_SEC = 1e9;

/*----------------------------------
- RECHERCHE DES SIMILARITÉS
----------------------------------*/

const cacheDatasets = getCheminResultats(paire, echelle) + '/datasets.json';
log("Chargement des groupes datasets depuis le cache ...");
const { valeurs, nbValeurs, datasets } = fs.readJsonSync(cacheDatasets);

// Progression groupes de similarités
let resultats = {}; // Taille => groupes
let iGroupeA = -1; // Index groupe de similarites

// Indexe les patterns vers leur groupe de similarités
let patternsVersGroupes = { // Taille => iValDebut => Groupe similarite
    ref: {},
    comp: {}
};
let nbPatternsVersGroupes = 0;

let nbGroupesSim = 0, nbSims = 0;

function ajouterResultat(tPatternA, patternRef, patternComp) {

    const iPatternRef = patternRef[0];
    const iPatternComp = patternComp[0];

    if (patternsVersGroupes.ref[ tPatternA ] === undefined)
        patternsVersGroupes.ref[ tPatternA ] = {};

    if (patternsVersGroupes.comp[ tPatternA ] === undefined)
        patternsVersGroupes.comp[ tPatternA ] = {};

    if (resultats[ tPatternA ] === undefined)
        resultats[ tPatternA ] = {};

    // Traçabilité: On prend l'index de la première valeur du pattern pour identifier sa provenance via veleurs
    patternRef = {
        vals: patternRef,
        iDataset: valeurs[ patternRef[0] ].iDataset
    };
    patternComp = {
        vals: patternComp,
        iDataset: valeurs[ patternComp[0] ].iDataset
    };

    const indexRefSimilaires = patternsVersGroupes.ref[ tPatternA ][ iPatternRef ];

    // La référence n'a pas encore été répertoriée, on créé un nouveau groupe avec référence et pattern
    if (indexRefSimilaires === undefined) {

        iGroupeA++;

        // Nouveau groupe de similarités
        resultats[ tPatternA ][ iGroupeA ] = {
            patterns: [
                patternRef,
                patternComp
            ],
            taille: tPatternA
        };

        patternsVersGroupes.ref[ tPatternA ][ iPatternRef ] = iGroupeA;
        patternsVersGroupes.comp[ tPatternA ][ iPatternComp ] = iGroupeA;

        nbPatternsVersGroupes += 2;
        nbGroupesSim++;
        nbSims++;

        //log('Nouveau groupe | Ref: '+ iPatternRef +' | Groupe: '+ patternsVersGroupes[ iPatternComp ] +' | Pattern: '+ iPatternComp +' | '+ similarite.infos.pointsSimilaires +' points similaires');

    // La référence a déjà été répertoriée, on ajoute le pattern à son groupe
    } else {

        resultats[ tPatternA ][ indexRefSimilaires ].patterns.push(
            patternComp
        );

        patternsVersGroupes.comp[ tPatternA ][ iPatternComp ] = indexRefSimilaires;

        nbPatternsVersGroupes++;
        nbSims++;

        //log('Nouveau pattern trouvé | Ref: '+ iPatternRef +' | Groupe: '+ indexRefSimilaires +' | Pattern: '+ iPatternComp +' | '+ similarite.infos.pointsSimilaires +' points similaires');
    }
}

const iMax = nbValeurs - 1;
function simVal(iValDebutRef, iValDebutComp) {

    let patternRef = [];
    let patternComp = [];

    // similarité précédente
    let similarite = { delta: null };

    for (let tPatternA = 0; ; tPatternA++) {

        const iValRef = iValDebutRef + tPatternA;
        const iValComp = iValDebutComp + tPatternA;

        similarite = checkSimilaritePrix(
            valeurs, iValRef, valeurs, iValComp, similarite
        );

        if (similarite === false)
            break;

        // taille 0 = index 0
        patternRef[ tPatternA ] = iValRef;
        patternComp[ tPatternA ] = iValComp;

        // On référence le pattern si taille minimum respectée
        if (tPatternA >= taillePattern.min)
            ajouterResultat(tPatternA, patternRef, patternComp);

        // index limite taille valeurs
        if (iValRef === iMax || iValComp === iMax)
            break;
    }
}

let timeA = Date.now();

let pcA = -1; // % de progression actuelle
const valsProgr = Math.floor(30000000 / nbValeurs);

let iValRef = 0, iValComp = 0;
// Inutile de d'aller jusqu'à la fin en sachant qu'un pattern ne pourrait être référencé à partir de fin - taille pattern min
iFinRef -= taillePattern.min;
const iFinComp = nbValeurs - 1 - taillePattern.min;
const nbValsRef = iFinRef - iDebutRef;

log(`Démarrage du croisement des patterns... | Ref: ${nbValsRef} valeurs | Comp: ${nbValeurs} valeurs | Indicateur progression: toutes les ${valsProgr} valeurs de référence`);

// Première valeur du pattern de référence
for (iValRef = iDebutRef; iValRef <= iFinRef; iValRef++) {

    // Première valeur du pattern de comparaison
    // Démarre à l'index de la valeur de ref pour éviter doublons de couples
    for (iValComp = iDebutRef; iValComp <= iFinComp; iValComp++) {

        // On ne compare pas une valur à elle-même
        if (iValRef === iValComp)
            continue;

        simVal( iValRef, iValComp );
    }

    const refsTraitees = iValRef - iDebutRef;
    if (refsTraitees !== 0 && refsTraitees % valsProgr === 0) {

        const now = Date.now();
        const temps = Math.round((now - timeA) / valsProgr);
        timeA = now;

        const refsAtraiter = iFinRef - iDebutRef;

        const progression = Math.floor(refsTraitees / refsAtraiter * 100);
        pcA = progression;

        log(
            temps + ' ms / ref | Restant: ' + msToStr(temps * (iFinRef - iValRef)) +
            ' | Traité: ' + refsTraitees + ' / ' + refsAtraiter + ' | ' + progression +
            '% || Groupes: '+ nbGroupesSim + ' | Sims: ' + nbSims +
            ' | Mem: ' + Math.round(process.memoryUsage().rss / 1048576) + ' MB'
        );
    }
}

/*----------------------------------
- Retournement résultats
----------------------------------*/
const nbResultats = iGroupeA + 1;

// Retablis le format tableau pour les groupes
let resultatsCorriges = {};
for (let taille in resultats)
    resultatsCorriges[ taille ] = Object.values(resultats[ taille ]);

log(`${nbResultats} groupes de similarités.`);

parentPort.postMessage(['FIN', {
    nbResultats,
    resultats: resultatsCorriges
}]);
