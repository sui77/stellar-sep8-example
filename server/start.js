const Koa = require('koa');
const KoaRouter = require('koa-router');
const KoaBody = require('koa-body');
const StellarSdk = require('stellar-sdk');
const fs = require('fs');

const main = async () => {
    StellarSdk.Network.useTestNetwork();

    let config = {};
    try {
        let configJSON = fs.readFileSync('./config.json', 'utf8');
        config = JSON.parse(configJSON);
    } catch (e) {
        await require('./tools/interactiveSetup.js')();
        process.exit();
    }

/*

    config = {
        port: 8087,
        baseUrl: 'http://stellar.sui.li',
        horizonUrl: 'https://horizon-testnet.sui.li',
        assetCode: 'GOAT',
        issuerPublic: 'GAJ3KDZSCF44ICEM5WZAYKUL2JC244GXD3G2CRMNQXRBJ3ME2YNMBPLH',
        issuerSecret: 'SDTZ5JVR7LXASPCO6AB2II2IL47G4DRUV6QPS5NRMUBUHPNA7XG5R4WD',
    }
*/
    const poorDi = {
        config: config,
        horizon: new StellarSdk.Server(config.horizonUrl),
        asset: new StellarSdk.Asset(config.assetCode, config.issuerPublic),
        issuerKeypair: StellarSdk.Keypair.fromSecret(config.issuerSecret),
        delayedTransactions: {}
    }

    const router = new KoaRouter();
    router.get('/', require('./actions/document.js')('/index.html', poorDi));
    router.get('/.well-known/stellar.toml', require('./actions/document.js')('/.well-known/stellar.toml', poorDi));
    router.get('/js/toml.js', require('./actions/document.js')('/js/toml.js', poorDi));
    router.get('/js/app.js', require('./actions/document.js')('/js/app.js', poorDi));
    router.get('/useraction', require('./actions/document.js')('/useraction.html', poorDi));

    router.post('/useraction', KoaBody(), require('./actions/postUseraction.js')(poorDi));
    router.post('/tx_approve', KoaBody(), require('./actions/approveTransaction.js')(poorDi));
    router.post('/createAccount', KoaBody(), require('./actions/createAccount.js')(poorDi));


    const app = new Koa();
    app
        .use(router.routes())
        .use(router.allowedMethods())
        .listen(config.port)
        .setTimeout(15000);
};

main();