/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

define([
    'uiComponent',
    'Magento_Customer/js/customer-data',
    'js/minicart-model',
    'jquery',
    'ko',
    'Magento_Ui/js/modal/modal',
    'mage/cookies',
], function (Component, customerData, minicart, $, ko) {
    'use strict';

    var addToCartCalls = 0;

    return Component.extend({
        checkoutUrl: window.checkout.checkoutUrl,

        initialize: function () {
            this.cart = minicart;

            this.summaryCount = minicart.summaryCount;

            minicart.changedItems.extend({ rateLimit: 1000 }).subscribe(updateItems);

            ko.pureComputed(function () {
                return minicart.items.filter(isItemToRemove);
            }).subscribe(updateItems);

            customerData.get('messages').subscribe(function () {
                if (minicartContent.modal('option').isOpen) {
                    clearAddedToCartMessage();
                }
            });
            customerData.get('cart').subscribe(function (updatedCart) {
                addToCartCalls--;

                minicart.load(updatedCart);

                if (addToCartCalls === 0) {
                    openModal();
                }
                if (addToCartCalls < 0) {
                    addToCartCalls = 0;
                }
            });
            $('[data-block="minicart"]').on('contentLoading', function () {
                addToCartCalls++;
            });

            var showcart = '#showcart';

            var minicartContent = $('.block-minicart')
                .on('click', '.action.delete', onClickActionDelete)
                .on('change', 'input.cart-item-qty', onChangeItemQty)
                .on('click', '.qty .decrease', onClickQtyDecrease)
                .on('click', '.qty .increase', onClickQtyIncrease)
                .on('click', 'a.action.checkout', function (event) {
                    $(event.currentTarget).addClass('disabled');
                })
                .on('click', '.action.close', closeModal)
                .on('modalclosed', function () {
                    if (minicartContent.modal('option').isOpen) return;

                    minicart.items.each(function (cartItem) {
                        cartItem.message('');
                    });

                    if (window.location.hash === showcart) {
                        var history = window.history;
                        if (history && history.pushState) {
                            history.pushState(null, document.title, location.href.split('#')[0]);
                        }
                    }

                    if (location.pathname.indexOf('checkout/') > 0) {
                        if (minicart.items.getLength() === 0) {
                            location.replace('/webbutik');
                        }
                        var sections = customerData.getExpiredSectionNames();
                        if (sections.length) {
                            customerData.reload(sections, true);
                        }
                    }
                });

            window.addEventListener('hashchange', function () {
                var isOpen = minicartContent.modal('option').isOpen;

                if (window.location.hash === showcart) {
                    openModal();
                } else if (isOpen) {
                    closeModal();
                }
            });

            if (window.location.hash === showcart) {
                openModal();
            }

            function openModal() {
                clearAddedToCartMessage();
                minicart.load();
                minicartContent.modal('option').isOpen ||
                    minicartContent.modal('openModal');
            }

            function closeModal() {
                clearAddedToCartMessage();
                minicartContent.modal('closeModal');
            }

            return this._super();
        },

        /**
         * @param {String} productType
         * @return {*|String}
         */
        getItemRenderer: function (productType) {
            return this.itemRenderer[productType] || 'defaultRenderer';
        }
    });

    function onClickActionDelete() {
        removeItem(ko.dataFor(this));
    }

    function removeItem(cartItem) {
        if (cartItem.qty() === 0) {
            minicart.items.remove(cartItem);
            return;
        }
        cartItem.updatedQty = 0;
        updateItem(cartItem, window.checkout.removeItemUrl)
            .then(function (response) {
                if (response.success) {
                    cartItem.remove();
                }
            });
    }

    function onChangeItemQty(event) {
        var input = event.target,
            value = input.valueAsNumber;

        if (value && input.validity && input.validity.valid) {
            ko.dataFor(this).qty(value);
        } else if (input.value === '0') {
            removeItem(ko.dataFor(this));
        }
    }

    function onClickQtyDecrease() {
        decreaseQty(ko.dataFor(this));
    }

    function onClickQtyIncrease() {
        increaseQty(ko.dataFor(this));
    }

    function decreaseQty(cartItem) {
        var input = getItemQtyInput(cartItem),
            minValue = 1,
            value;
        if (input && input.stepDown) {
            input.stepDown();
            value = input.validity && input.validity.valid && input.valueAsNumber;
        }
        cartItem.qty(value || Math.max(cartItem.updatedQty - 1, minValue) || minValue);
    }

    function increaseQty(cartItem) {
        var input = getItemQtyInput(cartItem),
            value;
        if (input && input.stepUp) {
            input.stepUp();
            value = input.validity && input.validity.valid && input.valueAsNumber;
        }
        cartItem.qty(value || cartItem.updatedQty + 1);
    }

    function getItemQtyInput(cartItem) {
        return document.getElementById('cart-item-' + cartItem.item_id + '-qty');
    }

    function updateItems(changedItems) {
        _.each(changedItems, updateItemQty);
    }

    function updateItemQty(cartItem) {
        if (isItemToRemove(cartItem)) {
            cartItem.updatedQty = 0;
            updateItem(cartItem, window.checkout.removeItemUrl)
                .then(reloadItems);
            return;
        }
        if (cartItem.updatedQty !== 0 && cartItem.isQtyChanged()) {
            var value = cartItem.qty();
            cartItem.updatedQty = value;
            updateItem(cartItem, window.checkout.updateItemQtyUrl, { item_qty: value })
                .then(reloadItems);
        }
    }

    function reloadItems (response) {
        if (response.success && minicart.items.getLength() > 0) {
            if (minicart.items.some(function (item) {
                return item.isQtyChanged();
            })) {
                return;
            }
            var sections = customerData.getExpiredSectionNames();
            if (sections.length) {
                customerData.reload(sections, true);
            }
        }
    }

    function isItemToRemove(item) {
        return item.qty() === 0 && item.updatedQty !== 0;
    }

    function getRelatedQty(relatedItem) {
        var relatedToItems = minicart.items.filter(function (item) {
            return item.getRelatedItem() === relatedItem;
        });

        return _.reduce(relatedToItems, function (sum, item) {
            return sum + item.updatedQty;
        }, 0);
    }

    function updateItem(cartItem, url, data) {
        return post(
            url,
            _.extend({ item_id: cartItem.item_id }, data),
            cartItem.onResponse
        ).then(function (response) {
            var relatedItem = response.success && cartItem.getRelatedItem();
            if (relatedItem) {
                relatedItem.onResponse = cartItem.onResponse;
                relatedItem.qty(getRelatedQty(relatedItem));
                if (relatedItem.qty() === 0) {
                    relatedItem.remove();
                }
            }
            return response;
        });
    }

    function post(url, data, onResponse) {
        data.form_key = $.mage.cookies.get('form_key');

        if (!window.fetch) {
            return $.post(url, data, onResponse, 'json');
        }

        var sections = ['cart'];

        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: $.param(data)
        }).then(function (response) {
            if (response.ok) return response.json();

            throw new Error(response.statusText);
        }).then(function (responseBody) {
            onResponse(responseBody);

            if (responseBody.success) {
                customerData.invalidate(sections);
            }
            return responseBody;
        }, function (error) {
            customerData.reload(sections, true);
            throw error;
        });
    }

    function clearAddedToCartMessage() {
        var messages = customerData.get('messages'),
            data = messages();

        if (data.messages && data.messages.filter) {
            var filteredMessages = data.messages.filter(function (message) {
                return message.type !== 'success'
            });
            if (filteredMessages.length !== data.messages.length) {
                messages({
                    messages: filteredMessages
                });
            }
        }
    }
});
