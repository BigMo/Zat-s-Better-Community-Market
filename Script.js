// ==UserScript==
// @name         Zat's Better Community Market
// @namespace
// @version      0.1
// @description  QuickSell ($), market price display, inventory networth, wallet balance
// @author       Zat
// @match        https://steamcommunity.com/id/*/inventory/*
// @grant        none
// @run-at document-end
// ==/UserScript==

Storage.prototype.setObject = function(key, value) {
    this.setItem(key, JSON.stringify({ time: new Date(), value: value }));
};

Storage.prototype.getObject = function(key) {
    var res = this.getItem(key);
    if (!res || res === null)
        return false;

    var val = JSON.parse(res);
    var nd = new Date(val.time);
    nd.setHours(nd.getHours() + 48);
    if (new Date() > nd) {
        this.removeItem(key);
        return false;
    }
    return val.value;
};

var inventory_networth = 0;
var g_Assets = localStorage.getObject("assets") ? localStorage.getObject("assets") : {};

function loadStuff(method, address, success, error, scope, post) {
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
    } else
        xmlhttp.send();
}

function checkInventory() {
    if (UserYou.nActiveAppId != 753)
        return;
    document.getElementById("inventory_applogo").src = "https://i.imgur.com/4GW6mWQ.png";
    document.title = "Zat's Better Community Market";
    var inventory = UserYou.rgContexts["753"]["6"].inventory;
    if (Object.keys(inventory.m_rgAssets).length == 0) {
        return;
    } else {}
    var assets = Array();
    for (var key in inventory.m_rgAssets) {
        if (inventory.m_rgAssets.hasOwnProperty(key)) {
            if (inventory.m_rgAssets[key].description.marketable == 1)
                assets.push(inventory.m_rgAssets[key]);
        }
    }
    for (var key in assets) {
        var asset = assets[key];
        var div = asset.element;
        if (!div)
            return;
        var sub = document.getElementById("price_" + asset.assetid);
        if (!sub) {
            var s = document.createElement("div");
            s.id = "price_" + asset.assetid;
            s.style.position = "absolute";
            s.style.bottom = "-1px";
            s.style.right = "-1px";
            s.style.background = "rgb(41,41,41)";
            s.style.padding = "2px 8px";
            s.style.float = "right";
            s.style.border = "solid #3A3A3A 1px";
            s.style.fontSize = "smaller";
            s.innerText = "[pending]";
            div.appendChild(s);
            if (g_Assets["" + asset.assetid]) {
                s.innerText = g_Assets["" + asset.assetid];
                installQuickSell(div, asset);
                updateNetworth(g_Assets["" + asset.assetid]);
            } else {
                loadStuff("GET", "https://steamcommunity.com/market/priceoverview/?country=" + g_rgWalletInfo.wallet_country + "&currency=" + g_rgWalletInfo.wallet_currency + "&appid=753&market_hash_name=" + asset.description.market_hash_name,
                    function(data, scope) {
                        var obj = JSON.parse(data);
                        scope.element.innerText = obj.lowest_price;
                        g_Assets["" + scope.asset.assetid] = obj.lowest_price;
                        localStorage.setObject("assets", g_Assets);
                        updateNetworth(obj.lowest_price);
                        installQuickSell(scope.parent, scope.asset);
                    },
                    function(status, scope) {
                        scope.element.innerText = "[E: " + status + "]";
                        scope.element.style.background = "#ff0000";
                    }, { element: s, asset: asset, parent: div });
            }
        }
    }
}

function getSellPrice(asset, price) {
    var nAmount = price;
    var quantity = 1;

    if (price && nAmount == parseInt(nAmount)) {
        // Calculate what the seller gets
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
    var btn = document.createElement("span");
    btn.classList.add("btn_small");
    btn.classList.add("btn_green_white_innerfade");
    btn.classList.add("item_market_action_button_contents");
    btn.style.position = "absolute";
    btn.style.zIndex = "999";
    btn.style.top = "0";
    btn.style.left = "0px";
    btn.style.padding = "2px 10px";
    btn.style.minWidth = "0px";
    btn.innerText = "$";
    parent.appendChild(btn);
    //console.log("Installed into " + parent.id);
    btn.addEventListener("click", function() {
        (function(scope) {
            var f = new FormData();
            if (!g_Assets["" + scope.asset.assetid]) {
                MessageDialog.Show("Unknown market-price: " + scope.asset.description.name, "Zat's Better Community Market");
            } else {
                var sellPrice = moneyToFloat(g_Assets["" + scope.asset.assetid]) - 1;
                if (sellPrice < 3)
                    sellPrice = 3;
                var price = getSellPrice(scope.asset, sellPrice);
                var f = "sessionid=" + g_sessionID +
                    "&appid=" + g_ActiveInventory.appid +
                    "&contextid=" + scope.asset.contextid +
                    "&assetid=" + scope.asset.assetid +
                    "&amount=" + 1 +
                    "&price=" + price;
                loadStuff("POST", "https://steamcommunity.com/market/sellitem/", function(data, scope) {
                    MessageDialog.Show("Successfully sold " + scope.asset.description.name + " for " + v_currencyformat(scope.sellPrice, GetCurrencyCode(g_rgWalletInfo['wallet_currency'])) + " (" + v_currencyformat(scope.price, GetCurrencyCode(g_rgWalletInfo['wallet_currency'])) + ")!", "Zat's Better Community Market");
                }, function(status, scope) {
                    MessageDialog.Show("Failed to sell " + scope.asset.description.name + ": " + status, "Zat's Better Community Market");
                }, {
                    asset: asset,
                    price: price,
                    sellPrice: sellPrice
                }, f);
            }
        })({ asset: asset });
    });
}

function updateNetworth(price) {
    var display = document.getElementById("inventory_networth");
    inventory_networth += parseFloat(price.replace(/[^0-9-.]/g, '')) / 100;
    inventory_networth = Math.round(inventory_networth * 100) / 100;
    display.innerText = "[Inventory: " + inventory_networth + "]";
}

(function() {
    'use strict';
    console.log("Zat's Better Community Market initiated!");
    console.log("Your SteamID: " + UserYou.strSteamId);
    document.getElementById("account_pulldown").innerText += " (" + (g_rgWalletInfo.wallet_balance / 100) + ")";
    if (UserYou.nActiveAppId != 753) {
        console.log("You're not browsing Steam-inventory, terminating.");
        return;
    } else {
        console.log("You're browsing Steam-inventory!");
    }
    var networth = document.createElement("div");
    document.getElementById("account_pulldown").appendChild(networth);
    networth.innerText = "[Inventory: 0.00]";
    networth.id = "inventory_networth";
    setInterval(checkInventory, 1000);
})();