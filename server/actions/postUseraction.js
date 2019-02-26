const fs = require('fs');

module.exports = function(di) {
    return async function(ctx, next) {
        di.delayedTransactions[ctx.request.body.txhash] = new Date().getTime();
        console.log(di.delayedTransactions);
        ctx.response.body = 'ok';
    }
}