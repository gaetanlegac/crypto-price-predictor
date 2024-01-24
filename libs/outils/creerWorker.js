
const { Worker } = require('worker_threads')
const dayjs = require('dayjs');

const creerWorker = (fichier, input, prefixeDebug, fFin, opts = {}) => new Promise((resolve, reject) => {

    const worker = new Worker(fichier, {
        workerData: input,
        resourceLimits: {
            maxOldGenerationSizeMb: 10 * 1024,
            maxYoungGenerationSizeMb: 10 * 1024,
            codeRangeSizeMb: 10 * 1024
        }
    });
    worker.on('message', (debug) => {

        if (Array.isArray( debug ) && debug[0] === 'FIN') {

            fFin(debug[1], resolve);

        } else {

            let txtDbg = dayjs().format('HH:mm:ss');

            if (prefixeDebug)
                txtDbg += ' | ' + prefixeDebug();

            console.log(txtDbg + ' ||', debug);

        }

    });
    worker.on('error', (err) => {
        reject(err);
    });
    worker.on('exit', (code) => {

        // via worker.terminate()
        if (code === 1) {
            resolve();
        }
    })

    if (opts && opts.before)
        opts.before(worker);

    return worker;
});

const creerWorkerAvecBulks = async ({
    source, nom, input, prefixeDebug, output, bulk
}) => {
    const creerWorkerBulk = async (idWorker, dernieresDonnees) => {

        const data = input(idWorker, dernieresDonnees);
        // Plus besoin de créer un nouveau bulk
        if (data === false) {

            //console.log(`[${nom}][Worker ${idWorker}] Plus de données disponibles.`);

            return false;
        }

        //console.log(`[${nom}] Création d'un worker (id: ${idWorker})`/*, JSON.stringify(process.memoryUsage())*/);

        const debug = () => `${nom} | ` + (prefixeDebug ? prefixeDebug(idWorker, data) : `| Worker ${idWorker}`);

        await creerWorker(source, data, debug, (donnees, resolve) => {

            //console.log(`[${nom}][Worker ${idWorker}] Terminé.`);

            output(donnees, idWorker, data);

            // Libère mémoire
            delete bulk.workers[ idWorker ];

            // Lorqu'un worker est terminé, on tente d'en créer un nouveau tant qu'il reste des données à traiter
            creerWorkerBulk( idWorker + bulk.nbWorkersParBulk, donnees ).then((nouveauBulk) => {

                // Plus de données à traiter
                if (nouveauBulk === false && bulk.arretRadical) {

                    for (const tWorker of Object.keys( bulk.workers ))
                        if (tWorker >= taille) {

                            console.log(`Arrêt du worker ${tWorker} ...`);

                            bulk.workers[ tWorker ].terminate();
                            delete bulk.workers[ tWorker ];
                        }

                }

                resolve();

            });

        }, {
            before: (worker) => {
                bulk.workers[ idWorker ] = worker;
            }
        });
    }

    const iWorkerDebut = bulk.iWorkerDebut || 0;

    let workersBulk = [];
    for (let bulkA = 0; bulkA < bulk.nbWorkersParBulk; bulkA++)
        workersBulk.push(() => creerWorkerBulk(bulkA));

    await Promise.all( workersBulk.map(w => w()) );
}

module.exports = { creerWorker, creerWorkerAvecBulks }
