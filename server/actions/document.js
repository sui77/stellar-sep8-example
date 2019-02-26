const fs = require('fs');

module.exports = function (file, di) {

    const tplVars = {
        ASSET_CODE:   di.asset.code,
        ASSET_ISSUER: di.asset.issuer,
        BASE_URL:     di.config.baseUrl,
        HORIZON_URL:  di.config.horizonUrl
    };

    return async function (ctx, next) {
        let document = fs.readFileSync('./htdocs/' + file, 'utf8');

        for (let n in tplVars) {
            let pattern = new RegExp('{{' + n + '}}', 'g');
            document = document.replace(pattern, tplVars[n]);
        }

        for (let n in ctx.request.query) {
            let pattern = new RegExp('{{GET_' + n + '}}', 'g');
            console.log(n, ctx.request.query[n]);
            document = document.replace(pattern, ctx.request.query[n].replace("'", ''));
        }
        if (ctx.request.url.match(/.well-known/)) {
            ctx.set('Access-Control-Allow-Origin', '*');
        }
        ctx.response.body = document;
        await next();
    }
}