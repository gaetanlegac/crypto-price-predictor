/*----------------------------------
- DEPENDANCES
----------------------------------*/
const { workerData, parentPort } = require('worker_threads');
const { checkSimilaritePrix } = require('../checkSimilarite');

const fs = require('fs-extra');
const path = require('path');

/*----------------------------------
- CONFIG & INIT
----------------------------------*/
const {
    dateMin
} = require('../config');

const { datasets } = workerData;

/*----------------------------------
- CALCUL VARIATIONS
----------------------------------*/
let nbValeursOrig = 0;
let nbValsTraitees = 0;
const nbDatasets = Object.keys(datasets).length;

iterationDatasets:
for (iDataset in datasets) {

    const dataset = datasets[ iDataset ];

    const clesDataset = Object.keys(dataset);
    const valsDataset = Object.values(dataset);
    const nbValsDataset = valsDataset.length;

    /*----------------------------------
    - PRÉCALCUL DES SIMILARITÉS
    ----------------------------------*/
    let deltaPrecedent = null;

    for (let iRef = 0; iRef <= nbValsDataset - 1; iRef++) {

        nbValeursOrig++;
        parentPort.postMessage(`${iDataset} / ${nbDatasets - 1} | ${iRef} / ${nbValsDataset - 1}`);

        for (let iVal = 0; iVal <= nbValsDataset - 1; iVal++) {

            // cacheSimsPrix est automatiquement rempli
            const infosSim = checkSimilaritePrix(
                valsDataset, iRef, valsDataset, iVal,
                deltaPrecedent
            );

            nbValsTraitees++;

            deltaPrecedent = infosSim.delta;

            //dataset[ iRef ] = valsDataset[ iRef ];
        }
    }

    /*----------------------------------
    - FINALISATION
    ----------------------------------*/
    // La séparation des clés des valeurs permet de manipuler les valeurs plus facilement, et d'éviter les répétitions de clés (celles-ci étant des chaines de date, elles prennent vite de la place)
    datasets[ iDataset ] = {
        cles: clesDataset,
        vals: valsDataset
    }
}

parentPort.postMessage(['FIN', {
    nbValsTraitees,
    datasets
}]);
