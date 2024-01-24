/*----------------------------------
- DEPENDANCES
----------------------------------*/
const dayjs = require('dayjs');
var TimSort = require('timsort');

const path = require('path');
const fs = require('fs-extra');

const { checkSimilaritePatterns } = require('./libs/checkSimilarite');

const api = require('./libs/api');

/*----------------------------------
- CONFIG
----------------------------------*/
const {
    taillePattern,

    food: { echelles },
    resultats: { getFichierResultats, getCheminResultats },
    paramsA: { echelle, paire }
} = require('./libs/config');

const formatDate = echelles[ echelle ][2];

const log = (...args) => console.log(`[${dayjs().format('HH:mm:ss')}][${echelle}]`, ...args);

const cacheDatasets = getCheminResultats(paire, echelle) + '/datasets.json';
log("Chargement des groupes datasets depuis le cache ...");
const { valeurs } = fs.readJsonSync(cacheDatasets);

/*----------------------------------
- METHODES
----------------------------------*/
let avgPatterns = [];

const avgPattern = (groupePatterns, valeurs) => {

    let avg = []; // [{ pointsSimilaires: int, [val1, val2, ...] }, ...]

    const iDebut = Object.values(graph[0]).length - 1 - groupePatterns.pointsSimilaires;
    const prixDebut = Object.values(graph[0])[ iDebut - 1 ];

    // Regroupement des valeurs par index
    for (const pattern of groupePatterns.patterns) {

        const valsPattern = pattern.vals;

        for (const iVal in valsPattern) {

            // Init groupe vals
            if (avg[ iVal ] === undefined)
                avg[ iVal ] = [];

            avg[ iVal ].push( valeurs[ valsPattern[ iVal ] ].rel );

        }
    }

    // Calcul moyenne et adaptation à l'échelle du graph
    avg = avg.map((groupeAvg) => {
        let somme = 0;
        for (const val of groupeAvg)
            somme += val;
        return (1 + (somme / groupeAvg.length)) * prixDebut;
    });

    // Positionnement sur le graph
    for (let iEsp = 0; iEsp <= iDebut; iEsp++)
        avg.unshift(null);

    graph.push( avg );

    return avg;

}

function getPatternGraph() {
    // Transformation du graph au format pattern
    let valsGraph = [];
    let prixPrecedent = undefined;
    // -1 car la première valeur du set n'aura pas de valeur relative
    for (const dateGraph in graph[0]) {

        const prix = graph[0][ dateGraph ];

        // Pas de valeur de comparaison sur le premier
        let variation = null;
        if (prixPrecedent !== undefined) {

            variation = 1 - (prixPrecedent / prix);

            valsGraph.push({ prix, variation });
        }

        prixPrecedent = prix;
    }
    let patternGraph = Object.keys(valsGraph).map(v => parseInt(v));

    return { valsGraph, patternGraph };
}

let groupesPatterns;
let patternsSimilaires = [];
const chercherPatternsSimilaires = () => {

    groupesPatterns = [];

    const fichierResultats = getFichierResultats(paire, echelle);
    groupesPatterns = fs.readJsonSync(fichierResultats);

    /*const cacheDatasets = getCheminResultats(paire, echelle) + '/datasets.json';
    log("Chargement des groupes datasets depuis le cache ...");
    const { valeurs } = fs.readJsonSync(cacheDatasets);

    const { valsGraph, patternGraph } = getPatternGraph();

    for (let tRef = taillePattern.min; tRef <= taillePattern.max; tRef++) {

        let patternGraphA = patternGraph.slice( -tRef - 1 );

        //console.log('REFERENCE', reference);

        log(`[Taille ${tRef}] Croisement du graphique actuel avec ` + groupesPatterns.length + ' groupes de patterns ...');

        let nbSimi = 0;

        itGroupes:
        for (let iGroupe in groupesPatterns) {

            let groupePatterns = groupesPatterns[ iGroupe ];
            //console.log(`Référence ${iGroupe} / ${groupesPatterns.length - 1}`);

            itPatterns:
            for (let pattern of groupePatterns.patterns) {

                if (pattern.vals.length < tRef)
                    continue;

                const similarite = checkSimilaritePatterns(
                    valsGraph, patternGraphA,
                    valeurs, pattern.vals,
                    tRef, false
                );

                if (similarite !== false && similarite.pointsSimilaires >= taillePattern.min * 0.5) {

                    nbSimi++;

                    // Màj du score selon la taille de la référence
                    groupesPatterns[ iGroupe ].score *= tRef;
                    // Ajout de la taille de la référence
                    groupesPatterns[ iGroupe ].tailleRef = tRef;
                    // Points similaires du groupe par rapport à la référence
                    groupesPatterns[ iGroupe ].pointsSimilaires = pattern.pointsSimilaires;

                    // Ajout du groupe
                    patternsSimilaires.push( groupePatterns );

                    // Le retire de la liste (évite les doublons)
                    delete groupesPatterns[ iGroupe ];

                    // On passe à un autre groupe
                    break itPatterns;

                }
            }
        }

        log(`Patterns similaires de taille ${tRef}:`, nbSimi);
    }

    // tri par nb de points similaires
    TimSort.sort(patternsSimilaires, ( a, b ) => {
        return b.pointsSimilaires - a.pointsSimilaires;
    });

    // Adaptation & insertion sur le graphique
    for (const groupePatterns of patternsSimilaires)
        avgPatterns.push(avgPattern(groupePatterns, valeurs));

    log('Total patterns similaires:', patternsSimilaires.length);*/
}

let graph = [];
let timerPrediction;

const rechargerGraph = async () => {

    clearTimeout(timerPrediction);
    timerPrediction = null;

    log('Refraichissement du graphique ...');

    const donnees = await api("https://min-api.cryptocompare.com/data/v2/histo"+ echelles[ echelle ][1] +"?fsym=BTC&tsym=USD&aggregate="+ echelles[ echelle ][0] +"&limit=" + (taillePattern.max + 1));

    graph = {};
    patternsSimilaires = [];

    // Formatage
    let date; // A la fin de la boucle, date = dernière date du graph
    for (const donnee of donnees.Data.Data) {

        date = dayjs(donnee.time * 1000).format(formatDate);
        const prix = donnee.close;

        graph[ date ] = prix;

    }

    // Le graph final sera un tableau contenant le graph actuel + les patterns les plus probables
    graph = [graph];

    chercherPatternsSimilaires();

    // Ajout espaces pour prédictions
    for (let iEsp = 0; iEsp <= taillePattern.max; iEsp++) {
        date = dayjs(date).add(echelles[ echelle ][0], echelles[ echelle ][1]).format(formatDate);
        graph[0][ date ] = null;
    }

    timerPrediction = setTimeout(rechargerGraph, 60000);
}

const demarrerServeur = () => {

    var express = require('express');
    var app = express();
    app.set('view engine', 'ejs');

    // index page
    app.get('/resultats', function(req, res) {
        res.render('resultats', {
            groupes: groupesPatterns.slice(-100),
            valeurs,
            graphBTC: null
        });
    });

    app.get('/predictions', function(req, res) {
        res.render('resultats', {
            groupes: patternsSimilaires.slice(0, 20),
            valeurs,
            graphBTC: graph.slice(0, 5)
        });
    });

    app.listen(8080);

    console.log("Serveur prêt");
}

demarrerServeur();

rechargerGraph();
