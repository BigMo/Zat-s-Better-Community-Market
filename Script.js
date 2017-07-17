// ==UserScript==
// @name         Zat's Better Community Market
// @namespace
// @version      0.2
// @description  QuickSell ($), market price display, inventory networth, wallet balance
// @author       Zat
// @match        https://steamcommunity.com/id/*/inventory/*
// @grant        none
// @run-at document-end
// ==/UserScript==
var $ = window.jQuery;

//TODO: Cache by classid or instanceid but NOT via instanceid!

var origFn = CInventory.prototype.BuildItemElement;
var asyncAssets = Array();

CInventory.prototype.BuildItemElement = function hkBuildItemElement(asset, $Item) {
    var args = Array.prototype.slice.call(arguments, 0);
    origFn.apply(this, args);
    checkAsset(asset, $Item);
};

function checkAsset(asset, $Item) {
    if (!asset.description.marketable)
        return;
    var div = $Item[0]; //asset.element;
    var sub = document.getElementById("price_" + asset.assetid);
    if (!sub) {
        if (!div)
            return;
        var s = createPriceElement(div, asset);
        var storedAsset = localStorage.getObject("asset" + asset.assetid);
        if (storedAsset) {
            s.innerText = storedAsset.price;
            installQuickSell(div, asset);
            updateNetworth(storedAsset.price);
        } else {
            asyncAssets.push({ element: s, parent: div, asset: asset });
        }
    } else {
        div = sub.parentNode;
        var storedAsset = localStorage.getObject("asset" + asset.assetid);
        if (!storedAsset) {
            asyncAssets.push({ element: sub, parent: div, asset: asset });
        }
    }
}

function processAsyncAssets() {
    if (!asyncAssets || !asyncAssets.length)
        return;
    var entry = asyncAssets[0];
    var element = entry.element;
    var parent = entry.parent;
    var asset = entry.asset;
    getMarketValueForElement(element, parent, asset,
        function(scope) {
            asyncAssets.splice(0, 1);
            processAsyncAssets();
        }, {});
}

//Put an item into a storage, adding an "expires"-field to it (used for caching expiration)
Storage.prototype.setObject = function(key, value) {
    var expires = new Date();
    expires.setHours(expires.getHours() + 2);
    this.setItem(key, JSON.stringify({ expires: expires, value: value }));
};

//Retrieve an item from a storage, checking for existance and expiration
Storage.prototype.getObject = function(key) {
    var res = this.getItem(key);
    if (!res || res === null)
        return false;
    var val = JSON.parse(res);
    if (new Date() > val.expires) {
        this.removeItem(key);
        return false;
    }
    return val.value;
};

var inventory_networth = 0;

//Performs a webrequest
function httpRequest(method, address, success, error, scope, post) {
    var xmlhttp = new XMLHttpRequest();

    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {
            if (xmlhttp.status == 200) {
                success(xmlhttp.responseText, scope);
            } else if (error !== null) {
                error(xmlhttp.status, scope);
            }
        }
    };

    xmlhttp.open(method, address, true);
    if (post) {
        xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded; charset=UTF-8");
        xmlhttp.send(post);
    } else {
        xmlhttp.send();
    }
}

function createPriceElement(parent, asset) {
    var s = new Element('div', {
        'id': "price_" + asset.assetid,
        'style': 'position:absolute; bottom:-1px; right:-1px; background: rgb(41,41,41); padding: 2px 8px; float: right; border: solid #3A3A3A 1px; font-size: smaller;'
    });
    s.innerText = "[pending]";
    parent.appendChild(s);
    return s;
}

function getMarketValueForElement(element, parent, asset, onSuccess, onSuccessScope) {
    element.innerText = "[pending]";
    element.style.background = "rgb(41,41,41)";
    httpRequest("GET", "//steamcommunity.com/market/priceoverview/?country=" + g_rgWalletInfo.wallet_country + "&currency=" + g_rgWalletInfo.wallet_currency + "&appid=" + g_ActiveInventory.appid + "&market_hash_name=" + encodeURIComponent(GetMarketHashName(asset.description)),
        function(data, scope) {
            var obj = JSON.parse(data);
            scope.element.innerText = obj.lowest_price;
            scope.element.style.background = "rgb(41,41,41)";
            localStorage.setObject("asset" + scope.asset.assetid, { price: obj.lowest_price });
            updateNetworth(obj.lowest_price);
            installQuickSell(scope.parent, scope.asset);
            if (onSuccess)
                onSuccess(onSuccessScope);
        },
        function(status, scope) {
            scope.element.innerText = "[E: " + status + "]";
            scope.element.style.background = "#ff0000";
        }, { element: element, asset: asset, parent: parent });
}

function getSellPrice(asset, price) {
    var nAmount = price;
    var quantity = 1;

    if (price && nAmount == parseInt(nAmount)) {
        // Calculate what the seller gets, ripped from valve's code - thx m8s
        var publisherFee = typeof asset.description.market_fee != 'undefined' ? asset.description.market_fee : g_rgWalletInfo['wallet_publisher_fee_percent_default'];
        var feeInfo = CalculateFeeAmount(nAmount, publisherFee);
        nAmount = nAmount - feeInfo.fees;
        return nAmount;
    }
    return 0;
}

function moneyToFloat(str) {
    var match = str.match(/[0-9,.]*/);
    if (match !== null) {
        return parseFloat(match[0].replace(/,/g, '')); // replace , thousands separator
    }
    return 0;
}

function installQuickSell(parent, asset) {
    var btn = new Element('span', {
        'class': 'btn_small btn_green_white_innerfade item_market_action_button_contents',
        'style': 'position: absolute; z-index: 999; top: 0px; left: 0px; padding: 2px 10px; min-width: 0px'
    });
    btn.innerText = "$";
    parent.appendChild(btn);
    btn.addEventListener("click", function() {
        (function(scope) {
            var f = new FormData();
            var storedAsset = localStorage.getObject("asset" + scope.asset.assetid);
            if (!storedAsset) {
                MessageDialog.Show("Unknown market-price: " + scope.asset.description.name, "Zat's Better Community Market");
            } else {
                var sellPrice = moneyToFloat(storedAsset.price) - 1;
                if (sellPrice < 3)
                    sellPrice = 3;
                var price = getSellPrice(scope.asset, sellPrice);
                var f = "sessionid=" + g_sessionID +
                    "&appid=" + g_ActiveInventory.appid +
                    "&contextid=" + scope.asset.contextid +
                    "&assetid=" + scope.asset.assetid +
                    "&amount=" + 1 +
                    "&price=" + price;
                httpRequest("POST", "//steamcommunity.com/market/sellitem/", function(data, scope) {
                    var parent = scope.button.parentNode;
                    parent.style.opacity = 0.1;
                    parent.removeChild(scope.button);
                    //MessageDialog.Show("Successfully sold \"" + scope.asset.description.name + "\" for " + v_currencyformat( scope.sellPrice, GetCurrencyCode( g_rgWalletInfo['wallet_currency'] ) ) + " (" +  v_currencyformat( scope.price, GetCurrencyCode( g_rgWalletInfo['wallet_currency'] ) )+ ")!", "Zat's Better Community Market");
                }, function(status, scope) {
                    MessageDialog.Show("Failed to sell \"" + scope.asset.description.name + "\": " + status, "Zat's Better Community Market");
                }, {
                    asset: asset,
                    price: price,
                    sellPrice: sellPrice,
                    button: btn
                }, f);
            }
        })({ asset: asset, button: btn });
    });
}

function updateNetworth(price) {
    var display = document.getElementById("inventory_networth");
    inventory_networth += parseFloat(price.replace(/[^0-9-.]/g, '')) / 100;
    inventory_networth = Math.round(inventory_networth * 100) / 100;
    display.innerText = "[Inventory: " + v_currencyformat(inventory_networth * 100, GetCurrencyCode(g_rgWalletInfo['wallet_currency'])) + "]";
}

(function() {
    'use strict';
    console.log("Zat's Better Community Market initiated!");
    console.log("Your SteamID: " + UserYou.strSteamId);
    document.getElementById("account_pulldown").innerText += " (" + v_currencyformat(g_rgWalletInfo.wallet_balance, GetCurrencyCode(g_rgWalletInfo['wallet_currency'])) + ")";
    /*if (UserYou.nActiveAppId != 753) {
        console.log("You're not browsing Steam-inventory, terminating.");
        return;
    } else {
        console.log("You're browsing Steam-inventory!");
    }*/
    var networth = new Element("div");
    $("#account_pulldown").append(networth);
    networth.innerText = "[Inventory: 0.00]";
    networth.id = "inventory_networth";
    setTimeout(processAsyncAssets, 1000);
    setInterval(processAsyncAssets, 60 * 1000);
})();