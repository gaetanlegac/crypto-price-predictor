const { workerData, parentPort } = require('worker_threads')

const log = (txt) => parentPort ? parentPort.postMessage(txt) : console.log(txt);

const config = require('./config');

// Reduire AU MAXIMUM les instructions
const checkSimilaritePrix = (
    valeursRef, iRef,
    valeursComp, iPrix,
    simiPrecedente
) => {

    const prixRef = valeursRef[ iRef ].rel;
    const prixA = valeursComp[ iPrix ].rel;

    //log(`${prixRef} vs ${prixA}`);

    // VALEUR PRECEDENTE
    if (iRef !== 0 && iPrix !== 0) {

        const prixRefPrec = valeursRef[ iRef - 1 ].rel;
        const prixPrec = valeursComp[ iPrix - 1 ].rel;

        // TENDANCE
        // Pas valable sur la première valeur
        /*if (
            // Hausse
            (prixA >= prixPrec && prixRef < prixRefPrec)
            ||
            // Baisse
            (prixA < prixPrec && prixRef >= prixRefPrec)
        )
            return false;*/

        // Différence prix actuel et précédent de même signe pour les deux prix
        if ((prixA - prixPrec) * (prixRef - prixRefPrec) < 0) {
            //log(`Exclu (tendance)`);
            return false;
        }
    }

    // SIGNE: https://stackoverflow.com/a/10298155/12199605
    // - x - = + | - x + = -
    if ((prixA * prixRef) < 0) {
        //log(`Exclu (signe)`);
        return false;
    }

    // DELTA (% de difference entre la ref et le pattern)
    let delta;
    if (prixA < prixRef)
        delta = 1 - prixA / prixRef;
    else
        delta = 1 - prixRef / prixA;

    if (delta > config.deltaMax) {
        //log(`Exclu (delta)`);
        return false;
    }

    // DIFF DELTA
    let diffDelta = 0;
    if (simiPrecedente.delta !== null) {

        if (simiPrecedente.delta < delta)
            diffDelta = 1 - simiPrecedente.delta / delta;
        else
            diffDelta = 1 - delta / simiPrecedente.delta;

        if (diffDelta > config.diffDeltaMax) {
            //log(`Exclu (diff delta)`);
            return false;
        }
    }

    return { delta, diffDelta };
}

// Réduire AU MAXIMUM les instructions
// Les deux patterns DOIVENT toujours être de la même taille
const checkSimilaritePatterns = (
    valeursRef, patternRef,
    valeursComp, patternComp,
    tPattern, exacte = true
) => {

    let retour = {};
    let pointsSimilaires = 0;

    let similarite = { delta: null };

    // Verif si le même point présente assez de similarités dans le pattern et la référence
    for (let iVal = 0; iVal < tPattern; iVal++) {

        similarite = checkSimilaritePrix(
            valeursRef, patternRef[ iVal ],
            valeursComp, patternComp[ iVal ],

            similarite
        );

        if (similarite === false)
            break;

        // Le point a passé tous les tests de similarité,
        // Il est considéré comme similaire
        pointsSimilaires++;

    }

    if (exacte)
        return pointsSimilaires === tPattern;
    else
        return {
            pointsSimilaires
        }
}

module.exports = { checkSimilaritePrix, checkSimilaritePatterns };
