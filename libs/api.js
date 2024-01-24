
const https = require('https');

module.exports = (url) => new Promise((resolve) => {
    https.get(url, (res) => {

        let data = '';

        // A chunk of data has been recieved.
        res.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        res.on('end', () => {

            let donnees = JSON.parse(data);

            resolve( donnees );

        });
    });
});
