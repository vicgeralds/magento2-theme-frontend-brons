/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

define([
    'jquery',
    'mage/smart-keyboard-handler',
    'domReady!'
], function ($, keyboardHandler) {
    'use strict';

    var header = $('.page-header')
    header.find('.minisearch .input-text')
        .focus(function () {
            header.addClass('search-focus')
        })
        .blur(function () {
            header.removeClass('search-focus')
        })

    keyboardHandler.apply();
});
