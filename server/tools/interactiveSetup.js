const readline = require('readline');
const fs = require('fs');
const StellarSdk = require('stellar-sdk');
const request = require('request');

function readLineAsync(text, defaultValue) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve, reject) => {
        rl.question(text + " (" + defaultValue + ") > ", function (line) {
            if (line === '') {
                resolve(defaultValue);
            }
            resolve(line);
            rl.close();
        });
    });
}

async function createStellarAccountViaStellarFriendbot(publicKey) {
    await new Promise(function (resolve, reject) {
        request.get({
            url: 'https://friendbot.stellar.org',
            qs: {addr: publicKey},
            json: true
        }, function (error, response, body) {

            if (error || response.statusCode !== 200) {
                console.log(body);
                reject(new Error('FriendBot: Could not create stellar testnet account.'));
            }
            else {
                resolve();
            }
        });
    });
}

const setup = async function () {

    console.log('Config not found.');


    let port = await readLineAsync('On which port do you want to run the server?', '80');
    let homeDomain = await readLineAsync('What is your home domain?', require('os').hostname());
    let baseUrl = await readLineAsync('What is your base URL?', ((port == '443') ? 'https://' : 'http://') + homeDomain + '')
    let horizonUrl = await readLineAsync('Your Horizon Server?', 'https://horizon-testnet.stellar.org');
    let assetCode = await readLineAsync('Your Asset Code?', 'GOAT');
    let keypair = StellarSdk.Keypair.random();

    try {

        console.log("\nCreating new testnet account via friendbot...");
        await createStellarAccountViaStellarFriendbot(keypair.publicKey());

        StellarSdk.Network.useTestNetwork();
        const horizonServer = new StellarSdk.Server(horizonUrl);

        console.log("\nSetting auth_required flag...");
        let account = await horizonServer.loadAccount(keypair.publicKey());
        let tx = await new StellarSdk.TransactionBuilder(account)
            .addOperation(StellarSdk.Operation.setOptions({
                setFlags: 0x1,
                homeDomain: homeDomain
            }))
            .setTimeout(5000)
            .build();
        tx.sign(keypair);


        await horizonServer.submitTransaction(tx);

        const configData = {
            port: port,
            baseUrl: baseUrl,
            horizonUrl: horizonUrl,
            assetCode: assetCode,
            issuerPublic: keypair.publicKey(),
            issuerSecret: keypair.secret(),
        }

        console.log('config = ' + JSON.stringify(configData, null, 4));
        console.log('Writing config to config.json ...');
        fs.writeFileSync('config.json', JSON.stringify(configData, null, 4));


    } catch (e) {
        console.log(e);
        console.log(e.message);
        process.exit();
    }

    process.exit();
}

module.exports = setup;