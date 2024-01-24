const { workerData, parentPort } = require('worker_threads');
const dayjs = require('dayjs');
const fs = require('fs-extra');

const {
    dateMin,
    exchange, paire, echelle
} = require('../config');

const { fichiersDatasets } = workerData;

let datasets = {};
let totalDonnees = 0;
const nbFichiersDatasets = fichiersDatasets.length;

const arrondir = (val) => Math.round(val * 100000) / 100000;

// 1 Fichier = 1 Dataset

// Traitement du groupe de fichiers
for (let { fichier, iDataset } of fichiersDatasets) {

    datasets[ iDataset ] = {};

    let prixPrecedent = undefined;
    let nbDonneesDataset = 0;

    const donnees = fs.readJsonSync(fichier);
    for (let dateStr in donnees.graph) {

        let { c: prix } = donnees.graph[ dateStr ];

        const time = (new Date( dateStr )).getTime();

        if (time < dateMin)
            continue;

        if (datasets[ iDataset ][ dateStr ] !== undefined)
            continue;

        prix = parseFloat(prix);

        // Pas de valeur de comparaison sur le premier
        let variation = null;
        if (prixPrecedent !== undefined)
            variation = 1 - (prixPrecedent / prix);

        datasets[ iDataset ][ dateStr ] = {
            prix,
            rel: arrondir(variation),
            iDataset: parseInt(iDataset)
        };

        prixPrecedent = prix;

        nbDonneesDataset++;
        totalDonnees++;
    }

    const valeurs = Object.values(datasets[ iDataset ]);

    datasets[ iDataset ] = {

        cles: Object.keys(datasets[ iDataset ]),
        vals: valeurs,
        nbVals: nbDonneesDataset,

        exchange: donnees.exchange,
        echelle: donnees.echelle
    }

    //parentPort.postMessage(iDataset + ' / ' + nbFichiersDatasets + ' | ' + fichier + ' chargé. ' + nbDonneesDataset + ' données retenues');
}

parentPort.postMessage(['FIN', {
    datasets: datasets,
    nbTotalValeurs: totalDonnees
}]);
