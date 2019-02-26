const config = {
    horizonUrl: '{{HORIZON_URL}}',
}

let keypair = null;

StellarSdk.Network.useTestNetwork();
const horizon = new StellarSdk.Server(config.horizonUrl);

function initPaymentStream(keypair) {
    const es = horizon.transactions()
        .cursor('now')
        .forAccount(keypair.publicKey())
        .stream({
            onmessage: function (message) {
                loadAccount(keypair);
            }
        })
}

function txWasSignedBy(tx, keypair) {
    for (n in tx.signatures) {
        if (keypair.verify(tx.hash(), tx.signatures[n].signature())) {
            return true;
        }
    }
    return false;
}

function createAccount() {
    return new Promise((resolve, reject) => {

        keypair = StellarSdk.Keypair.random();
        $('#publicKey').html(keypair.publicKey());
        $('#secretKey').html(keypair.secret());
        $('#start').hide();
        $('#wallet').show();

        $.post("createAccount", {public: keypair.publicKey()})
            .done(async function (data) {
                try {
                    const transaction = new StellarSdk.Transaction(data.createtx);
                    log("CreateAccount TX (anchor signed) = " + xdrlink(data.createtx));
                    transaction.sign(keypair);
                    log("CreateAccount TX (user signed) = " + xdrlink(transaction.toEnvelope().toXDR('base64')));
                    await submitTransaction(transaction, 'CreateAccount');
                    resolve(keypair);
                } catch (error) {
                    let errmsg = JSON.stringify(_.get(error, 'response.data.extras.result_codes', error.message));
                    reject(new Error('Create account failed (' + errmsg + ')'));
                }
            })
            .fail(function (e) {
                reject(e.message);
            });
    });
}

async function loadAccount(keypair) {

    if (typeof(Storage) !== "undefined") {
        localStorage.setItem("secret", keypair.secret());
    }

    try {
        let account = await horizon.accounts()
            .accountId(keypair.publicKey())
            .call();

        $('#start').hide();
        $('#wallet').show();
        $('#publicKey').html(keypair.publicKey());
        $('#secretKey').html(keypair.secret());
        for (threshold in account.thresholds) {
            $('#' + threshold).html(account.thresholds[threshold]);
        }
        ;

        $('#signers').html('');
        for (signer in account.signers) {
            $('#signers').append('<li>' + account.signers[signer].public_key.substr(0, 6) + ', weight=' + account.signers[signer].weight);
        }

        $('#balances').html('');
        $('#send_asset option').remove();
        for (n in account.balances) {
            let balance = account.balances[n];
            let assetCode = (balance.asset_type == 'native') ? 'XLM' : balance.asset_code + '-' + balance.asset_issuer;
            $('#send_asset').append('<option value="' + assetCode + '">' + assetCode.substr(0, 11) + '</option>');
            $('#balances').append('<li>' + balance.balance + ' ' + assetCode.substr(0, 11) + '</li>');

            $("#balances").animate({opacity: 0}, 200, "linear", function () {
                $(this).animate({opacity: 1}, 200, "linear", function () {
                });
            });

            if (balance.asset_code == '{{ASSET_CODE}}' && $('#send_to').val() == '') {
                $('#send_to').val(balance.asset_issuer);
            }
        }
        $('.show-auth').show();

        return account;
    } catch (e) {
        modalShow('Error', 'Failed loading account: ' + e.message);
    }
}

function checkAccount(publicKey) {
}

async function signIn(keypair) {
    account = await loadAccount(keypair);
    checkAccount(account);
    initPaymentStream(keypair);
}

$(function () {

    if (typeof(Storage) !== "undefined") {
        $('input[name=secret]').val( localStorage.getItem("secret") );
    }


    $('#createAccountForm').submit(async function (e) {
        e.preventDefault();
        try {
            keypair = await createAccount();
            signIn(keypair);
        } catch (e) {
             modalShow('Error', e.message);
        }
    });

    $('#signInForm').submit(async function (e) {
        e.preventDefault();
        try {
            keypair = StellarSdk.Keypair.fromSecret($('input[name=secret]').val());
            signIn(keypair);
        } catch (e) {
            modalShow('Error', e.message);
        }
    });

    $('#rawXDRForm').submit(async function (e) {

        e.preventDefault();
        let transaction = new StellarSdk.Transaction($('#rawXDR').val());
        if (!txWasSignedBy(transaction, keypair)) {
            transaction.sign(keypair);
            let txresult = await submitTransaction(transaction, 'Re-Submitting');
        } else {
            const coSignedTx = await getApproval($('#approvalServerUrl').val(), transaction);
            await submitTransaction(coSignedTx, 'Re-Submitting');
        }

    });

    $('#paymentForm').submit(async function (e) {
        e.preventDefault();

        let to = $('#send_to').val();
        let amount = $('#send_amount').val();
        let asset = $('#send_asset').val();
        let memo = $('#send_memo').val();

        if (asset == 'XLM') {
            asset = StellarSdk.Asset.native();
        } else {
            let tmp = asset.split('-');
            asset = new StellarSdk.Asset(tmp[0], tmp[1]);
        }
        try {
            const sourceAccount = await horizon.loadAccount(keypair.publicKey());
            const options = {memo: new StellarSdk.Memo.text(memo)};
            const transaction = await new StellarSdk.TransactionBuilder(sourceAccount, options)
                .addOperation(StellarSdk.Operation.payment({
                    asset: asset,
                    destination: to,
                    amount: amount
                }))
                .build();

            log('Payment TX = ' + xdrlink(transaction.toEnvelope().toXDR('base64')));
            transaction.sign(keypair);
            log('Payment TX (user signed): ' + xdrlink(transaction.toEnvelope().toXDR('base64')));

            if (sourceAccount.signers.length == 1) {
                log('Account has only one signer, no co-signing required.');
                submitTransaction(transaction, 'Payment');
                return;
            }


            const approvalServer = await getApprovalServer(asset);
            if (approvalServer !== false) {
                log(asset.code + ' is a regulated asset. Sending approval request to ' + approvalServer);
                const coSignedTx = await getApproval(approvalServer, transaction);
                await submitTransaction(coSignedTx, 'Payment');
            }
        } catch (e) {
            log(e.message);
        }

    });

});

function modalShow(title, message, showButtons, rawxdr, timeoutMilliSeconds, actionURL, approvalServerUrl) {
    $('#modal .modal-title').html(title);
    $('#modal .message').html(message);

    if (showButtons) {
        $('#modal .modal-footer').show();
    } else {
        $('#modal .modal-footer').hide();
    }

    if (typeof rawxdr == 'string') {
        $('#rawXDRBlock').show();
        $('#rawXDR').val(rawxdr);
        $('#XDRViewer').show();
        $('#XDRViewer').attr('href', xdrlink(rawxdr, 1));
        $('#submitRawXDRButton').show();
    } else {
        $('#XDRViewer').hide();
        $('#rawXDRBlock').hide();
        $('#submitRawXDRButton').hide();
    }

    if (typeof timeoutMilliSeconds != 'undefined' && timeoutMilliSeconds != null) {
        const buttonText = $('#submitRawXDRButton button').html();
        $('#submitRawXDRButton button').attr('disabled', 'disabled');
        window.xTimeoutSeconds = Math.round(timeoutMilliSeconds / 1000);
        window.xTimeoutInterval = window.setInterval(function () {
            $('#submitRawXDRButton button').html(buttonText + ' (' + --window.xTimeoutSeconds + 's)');
            if (window.xTimeoutSeconds <= 0) {
                window.clearInterval(window.xTimeoutInterval);
                $('#submitRawXDRButton button').html(buttonText);
                $('#submitRawXDRButton button').removeAttr('disabled');
            }
        }, 1000);
    }

    if (typeof approvalServerUrl != 'undefined') {
        $('#approvalServerUrl').val(approvalServerUrl);
    }

    if (typeof actionURL != 'undefined' && actionURL != null) {
        $('#actionUrl').attr('href', actionURL);
        $('#actionUrl').show();
    } else {
        $('#actionUrl').hide();
    }
    $('#modal').modal('show');
}

async function submitTransaction(tx, descr) {
    modalShow('Sending...', descr + ' transaction is being submitted to the network.', false);
    try {
        const txresult = await horizon.submitTransaction(tx);
        modalShow('Success!', descr + ' transaction was sent.', true);
        log('TX submitted. hash=' + txlink(txresult.hash));
        return txresult;
    } catch (error) {
        let errmsg = JSON.stringify(_.get(error, 'response.data.extras.result_codes', error.message), null, 4);
        modalShow('Failure!', descr + ' transaction failed (' + errmsg + ').', true);
        log('TX failed: ' + errmsg);
        throw new Error(descr + ' TX submit failed (' + errmsg + ')');
    }
}

async function getApproval(url, transaction) {
    return new Promise((resolve, reject) => {
        const tx64 = transaction.toEnvelope().toXDR('base64');
        $.post(url, {tx: tx64})
            .always(
                async function (dataOrXHR, textStatus, XHRorError) {
                    let data, xhr;
                    if (typeof dataOrXHR.readyState != 'undefined') {
                        // error
                        xhr = dataOrXHR;
                        data = dataOrXHR.responseJSON;
                    } else {
                        // success
                        xhr = XHRorError;
                        data = dataOrXHR;
                    }

                    let tmp = JSON.parse(JSON.stringify(data));
                    if (typeof tmp.tx != 'undefined') {
                        tmp.tx = tmp.tx.substr(0, 10) + '...';
                    }
                    $('.message').html(data.message);
                    log("Approval Server response: " + xhr.status + " " + JSON.stringify(tmp));

                    switch (data.status) {
                        case 'success':
                            log('Payment TX (anchor signed) = ' + xdrlink(data.tx));
                            tx = new StellarSdk.Transaction(data.tx);
                            resolve(tx);
                            break;
                        case 'revised':
                            log('Revised TX: ' + xdrlink(data.tx));
                            modalShow('Revised', data.message, true, data.tx);
                            reject(new Error('Status Revised'));
                            break;
                        case 'pending':
                            log('timeout = ' + data.timeout + ' ms');
                            modalShow('Pending', data.message, true, tx64, data.timeout, null, url);
                            reject(new Error('Status Pending'));
                            break;
                        case 'action_required':
                            log('action_url = <a href="' + data.action_url + '" target="_blank">' + data.action_url + '</a>');
                            modalShow('Pending', data.message, true, tx64, null, data.action_url, url);
                            reject(new Error('Status Action Required'));
                            break;
                        case 'rejected':
                            modalShow('Rejected', data.message, true);
                            reject(new Error('Status Rejected'));
                            break;
                        default:
                            reject(new Error('Unknown Status ' + data.status));
                            break;
                    }
                }
            );
    });
}

function getHomeDomain(publicKey) {
    return new Promise(async (resolve, reject) => {
        const account = await horizon.accounts()
            .accountId(publicKey)
            .call();
        if (_.has(account, 'home_domain')) {
            resolve(account.home_domain);
        } else {
            reject(new Error('home_domain not set'));
        }
    });
}

function getStellarToml(domain) {
    let tomlLocation = 'https://' + domain + '/.well-known/stellar.toml';

    return new Promise((resolve, reject) => {

        $.get(tomlLocation).done(
            (data) => {
                log('Successfully retrieved <a href="' + tomlLocation + '" target="_blank">' + tomlLocation + '</a>');
                try {
                    let parsed = toml.parse(data);
                    resolve(parsed);
                } catch (e) {
                    console.log("Das hier", e);
                    reject(new Error('Could not parse stellar.toml: ' + e.message + ' In line ' + _.get(e, 'line', '')));
                }
            }
        ).fail(
            (jqXHR, textStatus, errorThrown) => {
                console.log(jqXHR);
                let message = jqXHR.status + ' ' + jqXHR.statusText;
                console.log(message);
                if (message == '0 error') {
                    message += ' probably blocked by CORS policy';
                }
                reject(new Error('Failed to load <a href="' + tomlLocation + '" target="_blank">' + tomlLocation + '</a> (' + message + ')'));
            }
        )
        ;
    });
}

function getCurrency(toml, asset) {
    return new Promise((resolve, reject) => {
        if (_.has(toml, 'CURRENCIES')) {
            _.forOwn(toml.CURRENCIES, function (v, k) {
                if (v.issuer == asset.issuer && v.code == asset.code) {
                    resolve(v);
                    return false;
                }
            });
        }
        reject(false);
    });
}

async function getApprovalServer(asset) {
    try {
        if (typeof asset.issuer == 'undefined') {
            throw new Error(asset.code + ' is not a regulated asset. Nevertheless I still need another signature but I can not locate the approval_server... this is the flaw in SEP-0008');
        }

        const homeDomain = await getHomeDomain(asset.issuer);
        const stellarToml = await getStellarToml(homeDomain);
        const currency = await getCurrency(stellarToml, asset);

        if (!_.get(currency, 'regulated', false)) {
            throw new Error(asset.code + ' is not a regulated asset (regulated != true).');
        }

        if (!_.has(currency, 'approval_criteria')) {
            log(asset.code + ' is a regulated asset but is missing approval_criteria.');
        }

        if (!_.has(currency, 'approval_server')) {
            throw new Error(asset.code + ' is a regulated asset but is missing approval_server.');
        }

        return currency.approval_server;

    } catch (e) {
        log(e.message);
    }

    return false;
}

function log(msg) {
    //console.log(msg);
    $('#log').append('<div class="log-line">' + msg + '</div>');
    $('#log').scrollTop($('#log')[0].scrollHeight);
}


function xdrlink(xdr, linkonly) {
    if (linkonly) {
        return 'https://www.stellar.org/laboratory/#xdr-viewer?input=' + encodeURIComponent(xdr);
    }
    return '<a href="https://www.stellar.org/laboratory/#xdr-viewer?input=' + encodeURIComponent(xdr) + '" target="_blank">' + xdr.substr(0, 10) + '...</a>';
}

function txlink(hash) {
    return '<a href="' + config.horizonUrl + '/transactions/' + hash + '" target="_blank">' + hash.substr(0, 10) + '...</a>'
}

