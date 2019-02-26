const StellarSdk = require('stellar-sdk');

module.exports = function (di) {
    return async function (ctx, next) {
        try {
            ctx.set('Access-Control-Allow-Origin', '*');
            if (typeof ctx.request.body.tx == 'undefined') {
                throw new Error('Request parameter tx required.');
            }
            const transaction = new StellarSdk.Transaction(ctx.request.body.tx);
            txhash = transaction.hash().toString('base64');
            let action = transaction.memo.value.toString('utf8');

            if (typeof di.delayedTransactions[txhash] != 'undefined') {
                action = 'success';
            }
            console.log(action);
            switch (action) {
                case 'revised':

                    transaction.tx._attributes.memo = new StellarSdk.Memo.text('success').toXDRObject();
                    transaction.signatures = [];
                    transaction.sign(di.issuerKeypair);

console.log(transaction.tx);

                    ctx.response.body = {
                        status: 'revised',
                        tx: transaction.toEnvelope().toXDR('base64'),
                        message: 'Memo was changed to "success", you may sign and submit the revised transaction.'
                    }
                    break;
                case 'pending':
                    console.log(transaction.hash());
                    di.delayedTransactions[transaction.hash().toString('base64')] = new Date().getTime();
                    console.log(di.delayedTransactions);
                    ctx.response.body = {
                        status: 'pending',
                        timeout: 10 * 1000,
                        message: 'Approval in progress, please resubmit the same transaction again in 10 seconds.'
                    }
                    break;
                case 'action_required':
                    ctx.response.body = {
                        status: 'action_required',
                        action_url: di.config.baseUrl + '/useraction?txhash=' + encodeURIComponent(txhash),
                        message: 'Please follow the instructions at ' + di.config.baseUrl + '/useraction?txhash=' + encodeURIComponent(txhash),
                    }
                    break;
                case 'rejected':
                    ctx.response.status = 400;
                    ctx.response.body = {
                        status: 'rejected',
                        tx: transaction.toEnvelope().toXDR('base64'),
                        message: 'Memo is not acceptable.'
                    }
                    break;
                default:
                    transaction.sign(di.issuerKeypair);
                    ctx.response.body = {
                        status: 'success',
                        tx: transaction.toEnvelope().toXDR('base64'),
                        message: 'Transaction was approved and signed.'
                    }
                    break;
            }

            console.log(transaction.memo.value.toString('utf8'));

        } catch (e) {
            console.log(e);
            ctx.response.status = 400;
            ctx.response.body = {
                status: 'rejected',
                error: e.message
            }
        }
    }
}