const dayjs = require('dayjs');
const fs = require('fs-extra');

var ccxt = require ('ccxt');
const cloudscraper = require ('cloudscraper')

/*----------------------------------
- CONFIG
----------------------------------*/
const {
    taillePattern,

    food: { dossierFood, configExchanges, isoler, paires, echelles, getDossierDatasets },
    paramsA
} = require('./libs/config');

/*----------------------------------
- OUTILS
----------------------------------*/
let sleep = (ms) => new Promise (resolve => setTimeout (resolve, ms));

// https://github.com/ccxt/ccxt/blob/master/examples/js/bypass-cloudflare.js
const scrapeCloudflareHttpHeaderCookie = (url) =>

	(new Promise ((resolve, reject) =>

		(cloudscraper.get (url, function (error, response, body) {

			if (error) {

				reject (error)

			} else {

				resolve (response.request.headers)
			}
		}))
    ))

/*----------------------------------
- METHODES
----------------------------------*/
let erreursExchanges = [];
const maxTentatives = 10;

const dump = (
    exchange, paire, echelle
) => new Promise( async (resolve, reject) => {

    let tentatives = 0;

    const { resultatsMax: limite, remplacer } = configExchanges[ exchange.id ];
    const formatDate = echelles[ echelle ][2];

    let echelleExchange = echelle;
    const dossierDatasets = getDossierDatasets(paire.replace('/', '-'), echelle, exchange.id);

    // Si existant, charger en mémoire
    let graph = {};

    if (fs.existsSync(dossierDatasets)) {
        console.error(`[${exchange.id}][${echelle}] Le dossier ${dossierDatasets} n'est pas vide.`);
        return;
    }

    if (remplacer) {
        if (remplacer.assets) {
            const assets = paire.split('/');
            for (const [asset, equivalent] of Object.entries(remplacer.assets)) {

                if (assets[0] === asset) {
                    console.log(`[${exchange.id}][${echelle}] Remplacement de ${paire} par ${equivalent + '/' + assets[1]}`);
                    paire = equivalent + '/' + assets[1];
                }

                if (assets[1] === asset) {
                    console.log(`[${exchange.id}][${echelle}] Remplacement de ${paire} par ${assets[0] + '/' + equivalent}`);
                    paire = assets[0] + '/' + equivalent;
                }
            }
        }

        if (remplacer.echelle) {
            if (echelle in remplacer.echelle) {
                console.log(`[${exchange.id}][${echelle}] Remplacement de l'échelle ${echelleExchange} par ${remplacer.echelle[ echelleExchange ]}`);
                echelleExchange = remplacer.echelle[ echelleExchange ];
            }
        }
    }

    const markets = await exchange.load_markets();
    //console.log(`Initialisation de ${exchange.id}`, Object.keys(markets));
    if (!(paire in markets)) {
        console.log(`[${exchange.id}][${echelle}] Paire ${paire} non-supportée.`, Object.keys(markets).join(', '));
        reject();
        return;
    }

    if (!(echelleExchange in exchange.timeframes)) {
        console.log(`[${exchange.id}][${echelle}] Echelle ${echelle} non-supportée.`, Object.keys(exchange.timeframes).join(', '));
        reject();
        return;
    }

    let depuis = dayjs().valueOf();//exchange.milliseconds();
    let nbTimeouts = 0;
    while (1) {

        // Période précédente
        depuis = dayjs( depuis ).subtract(
            // Préfère avoir des doublons (qui seront fusionnés) plutot que des manquant
            Math.floor(limite * echelles[echelle][0] * 1),
            echelles[echelle][1]
        ).valueOf();

        console.log(`[${exchange.id}][${echelle}] Dump depuis ` + dayjs(depuis).format(formatDate));

        let tempsReq = Date.now();

        let candles;
        const requete = async () => {
            try {
                candles = await exchange.fetchOHLCV(paire, echelleExchange, depuis, limite);
            } catch (e) {

                //if (e instanceof ccxt.RequestTimeout) {

                if (tentatives <= maxTentatives) {

                    console.log(`[${exchange.id}][${echelle}] Erreur réponse: ${e.constructor.name}: ${e.message}. Tentative ${tentatives + 1} dans 30s ...`);
                    nbTimeouts++;
                    tentatives++;
                    await sleep(60 * 1000);
                    await requete();

                } else {

                    erreursExchanges.push(exchange.id);
                    console.log(`[${exchange.id}][${echelle}] Erreur réponse: ${e.constructor.name}: ${e.message}. Abandon suite à ${tentatives + 1} tentatives.`);
                    resolve();
                }

                /*} else {

                    console.log('--------------------------------------------------------')
                    console.log( exchange.id, echelle, e.constructor.name, e.message )
                    console.log('--------------------------------------------------------')
                    console.log( exchange.last_http_response )
                    console.log('Failed.')
                    //reject(e);
                    resolve();
                }*/

            }
        }

        try {
            await requete();

        } catch (e) {



        }

        tempsReq = Date.now() - tempsReq;
        if (candles && candles.length) {

            let nbValsNulles = 0;
            let nbValsConseq = 0;

            let nbPrixConseq = 0; // Nombre de fois où le prix est resté le même (données corrompues)
            let prixPrecedent = undefined;

            let debut = undefined;
            let data = {};
            for (const [time, o, h, l, c, v] of candles) {

                const date = dayjs(time).format(formatDate);

                // Exclusion valeurs nulles
                if (c === 0 || v === 0) {
                    //console.log(`[${exchange.id}][${echelle}][${date}] Prix = 0. Rejet de la donnée.`);
                    nbValsNulles++;
                    continue;
                }

                if (debut === undefined)
                    debut = time;

                // Valeur consécutive
                if (c === prixPrecedent) {
                    nbPrixConseq++;
                } else {
                    // Reinit compteur
                    nbPrixConseq = 0;
                }
                // Si nb valeurs conécutives > 2, on ne la prend pas en compte
                if (nbPrixConseq > 2) {
                    //console.log(`[${exchange.id}][${echelle}] Prix consécutif: ${nbPrixConseq} x ${c}`);
                    nbValsConseq++;
                    continue;
                }

                data[ date ] = { o, h, l, c, v }

                prixPrecedent = c;
            }

            /// Avant division en datasets, virer vleurs consecutives

            const dates = Object.keys( data );
            console.log(`[${exchange.id}][${echelle}] ${dates[0]} - ${dates[dates.length - 1]} | ${tempsReq} ms | ${candles.length} résultats | ${Object.keys(graph).length} au total | Tentatives: ${tentatives + 1} | Valeurs nulles: ${nbValsNulles} | Valeurs conseq: ${nbValsConseq} | Erreurs: ${erreursExchanges.length}`);

            /*if (dayjs(debut).format('DD/MM/YY') !== dayjs(depuis).format('DD/MM/YY')) {
                console.log(`[${exchange.id}][${echelle}] La première date (${dayjs(debut).format(formatDate)}) ne correspond pas à la date "depuis" ${dayjs(depuis).format(formatDate)}`);
                break;
            }*/

            if (dayjs(dates[0]).unix() >= dayjs(Object.keys(graph)[0]).unix()) {
                console.log(`[${exchange.id}][${echelle}] ${dates[0]} >= ${Object.keys(graph)[0]}. Fin du dump.`);
                break;
            }

            depuis = debut;

            //console.log(depuis, dernierDepuis);

            graph = {
                ...data,
                ...graph
            }

            await sleep(exchange.rateLimit * 2);

        } else {
            console.log(`[${exchange.id}][${echelle}] Plus de données reçues. Fin du dump.`);
            break;
        }
    }

    // Intgrité des données
    const datesResultats = Object.keys( graph );
    const nbResultats = datesResultats.length;
    console.log(`[${exchange.id}][${echelle}] ${nbResultats} Résultats au total. ${datesResultats[0]} - ${datesResultats[datesResultats.length - 1]}`);

    // Coupure = dataset différent
    let datasets = {};
    let datePrecedente = undefined;
    let datasetA =  undefined;
    for (let [dateStr, ohlc] of Object.entries( graph )) {

        if (ohlc.c === 0)
            break;

        if (datasetA === undefined)
            datasetA = dateStr;

        if (!( datasetA in datasets ))
            datasets[ datasetA ] = {};

        const date = dayjs(dateStr);
        const time = date.valueOf();

        // Si les jours ne se suivent pas ou que pas encore init
        const datePrecedenteAttendue = dayjs(date).subtract(
            echelles[echelle][0], echelles[echelle][1]
        ).format(formatDate);
        if (datePrecedente === undefined || datePrecedente !== datePrecedenteAttendue) {

            //console.log(`[${exchange.id}][${echelle}] Changement de dataset pour ${dateStr}`);

            // Changement & init dataset
            datasetA = dateStr;
            datasets[ datasetA ] = {};
        }

        datasets[ datasetA ][ dateStr ] = ohlc;

        datePrecedente = dateStr;
    }

    let nbDatasetsEnregistres = 0;
    for (const [nomDataSet, dataset] of Object.entries( datasets )) {

        const nbDonnees = Object.keys(dataset).length;
        if (nbDonnees < taillePattern.min) {
            //console.log(`[${exchange.id}][${echelle}] Exclusion du dataset ${nomDataSet}: Trop peu de données (${nbDonnees})`);
            continue;
        }

        nbDatasetsEnregistres++;

        fs.outputJsonSync(
            dossierDatasets + dayjs(nomDataSet).format('YY.MM.DD HH.mm') + ' - x' + nbDonnees + '.json',
            {
                exchange: exchange.id,
                echelle: echelle,
                graph: dataset
            },
            {
                spaces: 4
            }
        );
    }

    console.log(`[${exchange.id}][${echelle}] ${nbDatasetsEnregistres} datasets enregistrés`);

    resolve( graph );
});

let fetchers = [];

;(async () => {
    for (const nomEx of (isoler ? [isoler] : Object.keys(configExchanges))) {

        const exchange = new ccxt[ nomEx ]({
            debug: true,
            timeout: 1 * 60 * 1000 // ms, pour connexion lente ...
        });

        if (exchange.has.fetchOHLCV) {

            exchange.options["fetchOHLCVWarning"] = false;
            //exchange.headers = await scrapeCloudflareHttpHeaderCookie(exchange.urls.www);

            /*for (const paire of paires)
                for (const echelle of Object.keys( echelles ))*/
                    fetchers.push(() => dump(exchange, paramsA.paire.replace('-', '/'), paramsA.echelle));

        }
    }

    await Promise.all( fetchers.map((f) => f()) );

    console.log(`Dumps terminés. Erreurs: ${erreursExchanges.join(', ')}`);
})();
