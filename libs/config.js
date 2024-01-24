
const dayjs = require('dayjs');

module.exports = {};

/*----------------------------------
- FOOD
----------------------------------*/
const dossierFood = './food';
module.exports.food = {
    dossierFood: dossierFood,
    configExchanges: {
        coinbasepro: { // https://docs.pro.coinbase.com/#get-product-ticker
            resultatsMax: 300
        },
        binanceus: { // https://github.com/binance-exchange/binance-official-api-docs/blob/master/rest-api.md#klinecandlestick-data
            resultatsMax: 1000
        },
        binance: { // https://github.com/binance-exchange/binance-official-api-docs/blob/master/rest-api.md#klinecandlestick-data
            resultatsMax: 1000,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                }
            }
        },
        bitfinex2: { // https://docs.bitfinex.com/reference#rest-public-candles
            resultatsMax: 10000
        },
        bittrex: { // https://bittrex.github.io/api/v3#tag-Markets
            resultatsMax: 200
        },
        kraken: { // https://www.kraken.com/features/api#public-market-data
            resultatsMax: 1000
        },
        gemini: { // https://docs.gemini.com/rest-api/#trade-history
            resultatsMax: 500
        },
        hitbtc2: { // https://api.hitbtc.com/#trading-history
            resultatsMax: 1000,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                }
            }
        },
        poloniex: { // https://docs.poloniex.com/#returnchartdata
            resultatsMax: 200,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                },
                echelle: {
                    '1h': '30m'
                }
            }
        },


        bitmex: { // https://www.bitmex.com/api/explorer/#/Trade
            resultatsMax: 500
        },
        /* Trop peu de données en USDT
        coinex: { // https://github.com/coinexcom/coinex_exchange_api/wiki/024kline
            resultatsMax: 1000,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                }
            }
        },*/
        bytetrade: { // ?
            resultatsMax: 500,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                }
            }
        },
        upbit: { // https://docs.upbit.com/v1.0.6/reference#%EB%B6%84minute-%EC%BA%94%EB%93%A4-1
            resultatsMax: 200,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                }
            }
        },
        huobipro: { // https://huobiapi.github.io/docs/spot/v1/en/#get-klines-candles
            resultatsMax: 2000,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                }
            }
        },
        kucoin: { // https://docs.kucoin.com/#get-klines
            resultatsMax: 1500,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                }
            }
        },
        okcoinusd: { // https://docs.kucoin.com/#get-klines
            resultatsMax: 2000
        },
        okex3: { // https:// www.okex.com/docs/en/#spot-line
            resultatsMax: 2000,
            remplacer: {
                assets: {
                    'USD': 'USDT'
                }
            }
        },
    },
    isoler: false,//"okex3",

    paires: ['BTC/USD'],
    echelles: {
        '1h': [1, 'hour', 'YYYY-MM-DD HH:00:00'],
        '5m': [5, 'minute', 'YYYY-MM-DD HH:mm:00'],
        //'1m': [1, 'minute', 'YYYY-MM-DD HH:mm:00']
    },

    getDossierDatasets: (paire = undefined, echelle = undefined, exchange = undefined) => {
        let chemin = dossierFood + '/crypto/';

        if (paire)
            chemin += paire + '/';

        if (echelle)
            chemin += echelle + '/';

        if (exchange)
            chemin += exchange + '/';

        return chemin;
    }
}


/*----------------------------------
- DATASETS
----------------------------------*/
module.exports.datasets = {
    nbWorkersChargementDatasets: 100,
    nbDatasetsParWorker: 50
}

module.exports.paramsA = {
    paire: 'BTC-USD',
    echelle: process.argv[2] || '5m',
}

module.exports.taillePattern = {
    min: 10,
    max: 20
};

/*----------------------------------
- CALCULS
----------------------------------*/
module.exports.deltaMax = 100 / 100; // % de différence entre la valeur ref et la valeur du pattern
module.exports.diffDeltaMax = 100 / 100; // % de différence du delta max entre n-1 et n

module.exports.dateMin = dayjs().subtract(3, 'year').unix();

module.exports.minSimilarites = 5;

module.exports.calculs = {
    nbWorkersSimilarites: 4,
    nbResultatsMaxGroupe: 10000
}

/*----------------------------------
- RESULTATS
----------------------------------*/
const dossierResultats = './resultats';
module.exports.dossierResultats = dossierResultats;

module.exports.resultats = {
    getCheminResultats: (paire = undefined, echelle = undefined, iGroupeResultats = undefined) => {

        let retour = dossierResultats + `/crypto/${paire} - ${echelle}`;

        // Fichier temporaire résultat worker
        if (iGroupeResultats !== undefined)
            retour += '/groupe' + iGroupeResultats;

        return retour;
    },
    getFichierResultats: (...args) => {
        return module.exports.resultats.getCheminResultats(...args) + '.json';
    }
}
