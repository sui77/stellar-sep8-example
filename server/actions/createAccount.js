const StellarSdk = require('stellar-sdk');

module.exports = function (di) {
    return async function (ctx, next) {

        const userPublic = ctx.request.body.public;

        try {

            const sourceAccount = await di.horizon.loadAccount(di.issuerKeypair.publicKey());
            const transaction = await new StellarSdk.TransactionBuilder(sourceAccount)
                .addOperation(StellarSdk.Operation.createAccount({
                    startingBalance: '3',
                    destination: userPublic
                }))
                .addOperation(StellarSdk.Operation.changeTrust({
                    asset: di.asset,
                    source: userPublic
                }))
                .addOperation(StellarSdk.Operation.allowTrust({
                    assetCode: di.asset.code,
                    trustor: userPublic,
                    authorize: true,
                    source: di.issuerKeypair.publicKey()
                }))
                .addOperation(StellarSdk.Operation.setOptions({
                    signer: {
                        ed25519PublicKey: di.issuerKeypair.publicKey(),
                        weight: 2
                    },
                    source: userPublic
                }))
                .addOperation(StellarSdk.Operation.setOptions({
                    masterWeight: 2,
                    lowThreshold: 2,
                    medThreshold: 4,
                    highThreshold: 4,
                    source: userPublic
                }))
                .addOperation(StellarSdk.Operation.payment({
                    asset: di.asset,
                    destination: userPublic,
                    amount: '2000'
                }))
                .setTimeout(5000)
                .build();
            console.log(transaction);
            transaction.sign(di.issuerKeypair);

            ctx.response.body = {createtx: transaction.toEnvelope().toXDR('base64')};

        } catch (error) {
            ctx.response.code = 500;
            ctx.response.body = error.msg;
            console.log(error);
        }

    }
}