/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

define([
    'jquery',
    'underscore',
    'mage/template',
    'mage/translate',
    'priceUtils',
    'jquery-ui-modules/widget',
    'jquery/jquery.parsequery'
], function ($, _, mageTemplate, $t, priceUtils) {
    'use strict';

    /**
     * Render swatch controls with options and use tooltips.
     * Required two json:
     *  - jsonConfig (magento's option config)
     *  - jsonSwatchConfig (swatch's option config)
     *
     *  Tuning:
     *  - onlySwatches (hide selectboxes)
     *  - selectorProduct (selector for product container)
     *  - selectorProductPrice (selector for change price)
     */
    $.widget('mage.SwatchRenderer', {
        options: {
            classes: {
                optionClass: 'swatch-option',
                selectClass: 'swatch-select'
            },
            // option's json config
            jsonConfig: {},

            // swatch's json config
            jsonSwatchConfig: {},

            // selector of parental block of prices and swatches (need to know where to seek for price block)
            selectorProduct: '.product-info-main',

            // selector of price wrapper (need to know where set price)
            selectorProductPrice: '[data-role=priceBox]',

            // selector of category product tile wrapper
            selectorProductTile: '.product-item',

            // sly-old-price block selector
            slyOldPriceSelector: '.sly-old-price',

            // tier prise selectors start
            tierPriceTemplateSelector: '#tier-prices-template',
            tierPriceBlockSelector: '[data-role="tier-price-block"]',
            tierPriceTemplate: '',
            // tier prise selectors end

            // A price label selector
            normalPriceLabelSelector: '.normal-price .price-label'
        },

        /**
         * @private
         */
        _init: function () {
            // Don't render the same set of swatches twice
            if (this.element.data('rendered')) {
                return;
            }
            this.element.data('rendered', true);

            this._sortAttributes();
            this._RenderControls();
            this.options.tierPriceTemplate = $(this.options.tierPriceTemplateSelector).html();
        },

        /**
         * @private
         */
        _sortAttributes: function () {
            this.attributes = _.sortBy(this.options.jsonConfig.attributes, function (attribute) {
                return parseInt(attribute.position, 10);
            });
        },

        /**
         * @private
         */
        _create: function () {
            this.productForm = this.element.parents(this.options.selectorProductTile).find('form:first');
            this.inProductList = this.productForm.length > 0;
        },

        /**
         * Render controls
         *
         * @private
         */
        _RenderControls: function () {
            var $widget = this,
                container = this.element,
                chooseText = this.options.jsonConfig.chooseText,
                selectedAttributes = $.parseQuery(),
                relatedSelect = $('#related-select');

            _.each(this.attributes, function (item) {
                var field = container.find('.field.configurable[data-id=' + item.id + ']'),
                    control = field.find('.control'),
                    attrs = {
                        name: 'super_attribute[' + item.id + ']',
                        'data-attr-name': item.code
                    };

                item.element = field;

                if (relatedSelect.prop('required')) {
                    item.options = _.filter(item.options, function (option) {
                        // Remove option if no related product is available
                        return relatedSelect.find('[data-' + item.code + '=' + option.id + ']').length > 0;
                    });
                }

                if ($widget.inProductList) {
                    var input = $widget._RenderFormInput(item);

                    return $widget.productForm.append(
                        $(input).val(selectedAttributes[item.code] || '')
                    );
                }

                if ($widget.options.jsonSwatchConfig.hasOwnProperty(item.id)) {
                    control.append(
                        $widget._RenderSwatchOptions(item)
                    );
                } else {
                    control.append(
                        $widget._RenderSwatchSelect(item, chooseText)
                    );

                    attrs.id = 'attribute' + item.id;
                    field.find('label').attr('for', attrs.id);
                }

                control.find('input, select').attr(attrs);

                // Remove related products for options that are unavailable
                relatedSelect.find('option[data-' + item.code + ']')
                    .filter(function () {
                        return !_.some(item.options, { id: $(this).data(item.code) + '' });
                    })
                    .remove();
            });

            // Handle events like click or change
            $widget._EventListener();

            //Emulate click on all swatches from Request
            $widget._EmulateSelected(selectedAttributes);
        },

        /**
         * Render swatch options by part of config
         *
         * @param {Object} config
         * @param {String} controlId
         * @returns {String}
         * @private
         */
        _RenderSwatchOptions: function (config) {
            var optionConfig = this.options.jsonSwatchConfig[config.id],
                optionClass = this.options.classes.optionClass,
                html = '';

            config.options = _.filter(config.options, function (option) {
                var id,
                    type,
                    value,
                    label,
                    attr;

                if (!optionConfig.hasOwnProperty(option.id)) {
                    return false;
                }

                id = option.id;
                type = parseInt(optionConfig[id].type, 10);
                value = optionConfig[id].hasOwnProperty('value') ?
                    $('<i></i>').text(optionConfig[id].value).html() : '';
                label = option.label ? $('<i></i>').text(option.label).html() : '';
                attr =
                    ' title="' + label + '"';

                html += '<label class="' + optionClass;

                if (type === 0) {
                    html += ' text';
                    if (value) label = value;
                } else if (type === 1) {
                    html += ' color" style="background-color: ' + value;
                    label = '';
                } else if (type === 2) {
                    html += ' image" style="background-image: url(' + value + ')';
                    label = '';
                } else if (type === 3) {
                    label = '';
                }

                html += '" ' + attr + '><input type="radio" required value="' + id +
                    '"> ' + label + '</label>';

                return true;
            });

            return html;
        },

        /**
         * Render select by part of config
         *
         * @param {Object} config
         * @param {String} chooseText
         * @returns {String}
         * @private
         */
        _RenderSwatchSelect: function (config, chooseText) {
            var html =
                '<select class="' + this.options.classes.selectClass + '" required>' +
                '<option value="">' + chooseText + '</option>';

            $.each(config.options, function () {
                var label = this.label,
                    attr = ' value="' + this.id + '"';

                html += '<option ' + attr + '>' + label + '</option>';
            });

            html += '</select>';

            return html;
        },

        /**
         * Input for submit form.
         * This control shouldn't have "type=hidden", "display: none" for validation work :(
         *
         * @param {Object} config
         * @private
         */
        _RenderFormInput: function (config) {
            return '<input type="hidden" name="' + config.code + '">';
        },

        /**
         * Event listener
         *
         * @private
         */
        _EventListener: function () {
            var $widget = this,
                options = this.options.classes;

            $widget.element.on('change', '.' + options.optionClass, function () {
                return $widget._OnClick($(this), $widget);
            })

            .on('change', '#related-select', function () {
                if (this.value) {
                    var selectedOption = $(this).find(':checked');
                    _.each($widget.attributes, function (item) {
                        setSwatchOptionSelected($widget, item, selectedOption.data(item.code));
                    });
                    $widget.element.find('.product-custom-option').prop('checked', false);
                }
            })

            .on('change', '.product-custom-option', function () {
                $widget.element.find('#related-select').val('');
            })

            .on('change', '.field', function () {
                return $widget._OnChange($(this), $widget);
            })

            .on('keydown', function (e) {
                if (e.which === 13) {
                    var target = $(e.target);

                    if (target.is('.' + options.optionClass)) {
                        return $widget._OnClick(target, $widget);
                    } else if (target.is('.' + options.selectClass)) {
                        return $widget._OnChange(target, $widget);
                    }
                }
            });
        },

        /**
         * Load media gallery using ajax or json config.
         *
         * @private
         */
        _loadMedia: function () {
        },

        /**
         * Event for swatch options
         *
         * @param {Object} $this
         * @param {Object} $widget
         * @private
         */
        _OnClick: function ($this) {
            if ($this.hasClass('disabled')) {
                return;
            }

            $this.siblings('.selected').removeClass('selected');
            $this.addClass('selected')
                .find('input')
                .prop('checked', true);
        },

        /**
         * Event for select
         *
         * @param {Object} $this
         * @param {Object} $widget
         * @private
         */
        _OnChange: function ($this, $widget) {
            $widget._Rebuild();
            $widget._UpdatePrice();
            $widget._loadMedia();

            if ($widget.inProductList) return;

            var attributeId = $this.data('id'),
                changedAttribute = attributeId && $widget.options.jsonConfig.attributes[attributeId],
                value = $this.find('input:checked, select').val(),
                selectedAttributes = $.parseQuery();

            if (!changedAttribute) {
                changedAttribute = _.find($widget.options.jsonConfig.attributes, function (item) {
                    return $this.find('#related-select option[data-' + item.code + ']:checked')
                        .data(item.code);
                });
                value = changedAttribute &&
                    $this.find('option[data-' + changedAttribute.code + ']:checked')
                        .data(changedAttribute.code);
            }

            if (changedAttribute && 'replaceState' in window.history) {
                if (value) {
                    selectedAttributes[changedAttribute.code] = value;
                } else {
                    delete selectedAttributes[changedAttribute.code];
                }
                delete selectedAttributes[''];

                var params = $.param(selectedAttributes);

                window.history.replaceState(null, document.title, location.href.split('?')[0] + (
                    params ? '?' + params : ''
                ));
            }
        },

        /**
         * Rewind options for controls
         *
         * @private
         */
        _Rewind: function (controls) {
            var classes = this.options.classes,
                optionSelector = '.' + classes.optionClass;

            controls.find(optionSelector + '.disabled')
                .removeClass('disabled');

            controls.find(optionSelector + ' input:disabled, .' + classes.selectClass + ' option:disabled')
                .add('#related-select option, .product-custom-option')
                .prop('disabled', false);
        },

        /**
         * Rebuild container
         *
         * @private
         */
        _Rebuild: function () {
            var $widget = this,
                classes = this.options.classes,
                controls = $widget.element,
                relatedSelect = $('#related-select');

            // Enable all options
            $widget._Rewind(controls);

            // Disable not available options
            _.each(this.attributes, function (item) {
                var id = item.id,
                    products = $widget._CalcProducts(id);

                _.each(item.options, function (option) {
                    if (_.intersection(products, option.products).length <= 0) { 
                        item.element.find('[value=' + option.id + ']')
                            .prop('disabled', true)
                            .prop('checked', false)
                            .parent('.' + classes.optionClass)
                            .addClass('disabled');
                    }
                });

                var selectedValue = item.element.find(':checked').val(),
                    relatedSelectedValue = relatedSelect.prop('value') ||
                        relatedSelect.find(':checked').val();

                relatedSelect.find('option[data-' + item.code + ']')
                    .filter(function () {
                        var value = $(this).data(item.code);
                        return selectedValue
                            ? value != selectedValue
                            : getOptionDisabled(item.element, value) !== false;
                    })
                    .prop('disabled', true);

                if (relatedSelectedValue && getOptionDisabled(relatedSelect, relatedSelectedValue) !== false) {
                    relatedSelect.val('');
                }

                if (selectedValue && relatedSelect.length) {
                    controls.find('.product-custom-option')
                        .each(function () {
                            var labelText = $.trim(
                                    $(this).next('.label').text()
                                ),
                                relatedValue = labelText && relatedSelect.find(
                                    'option:enabled:contains(' + labelText.toLowerCase() + ')'
                                ).val();

                            if (relatedValue) {
                                if (this.checked) {
                                    relatedSelect.val(relatedValue);
                                } else {
                                    this.checked = relatedSelectedValue == relatedValue;
                                }
                            } else if (labelText) {
                                this.disabled = true;
                                this.checked = false;
                            }
                        });
                }
            });

            function getOptionDisabled (control, value) {
                if (value) {
                    return control.find('[value=' + value + ']')
                        .prop('disabled');
                }
            }
        },

        /**
         * Get selected product list
         *
         * @returns {Array}
         * @private
         */
        _CalcProducts: function ($skipAttributeId) {
            var $widget = this,
                products = _.uniq(_.flatten(
                    _.map($widget.attributes, function (item) {
                        return _.map(item.options, 'products');
                    })
                ));

            // Generate intersection of products
            _.each($widget.attributes, function (item) {
                if ($skipAttributeId === item.id) {
                    return;
                }

                var input = $widget.inProductList
                    ? $widget.productForm.find('[name="' + item.code + '"]')
                    : item.element.find('input:checked, select');

                var value = input.val(),
                    option = value && _.findWhere(item.options, { id: value });

                if (option) {
                    products = _.intersection(products, option.products);
                }
            });

            return products;
        },

        /**
         * Update total price
         *
         * @private
         */
        _UpdatePrice: function () {
            var $widget = this,
                $product = $widget.element.parents($widget.options.selectorProduct),
                $productPrice = $product.find(this.options.selectorProductPrice),
                result = $widget._getNewPrices(),
                tierPriceHtml,
                isShow;

            $productPrice.trigger(
                'updatePrice',
                {
                    'prices': $widget._getPrices(result, $productPrice.priceBox('option').prices)
                }
            );

            isShow = typeof result != 'undefined' && result.oldPrice.amount !== result.finalPrice.amount;

            $product.find(this.options.slyOldPriceSelector)[isShow ? 'show' : 'hide']();

            if (typeof result != 'undefined' && result.tierPrices && result.tierPrices.length) {
                if (this.options.tierPriceTemplate) {
                    tierPriceHtml = mageTemplate(
                        this.options.tierPriceTemplate,
                        {
                            'tierPrices': result.tierPrices,
                            '$t': $t,
                            'currencyFormat': this.options.jsonConfig.currencyFormat,
                            'priceUtils': priceUtils
                        }
                    );
                    $(this.options.tierPriceBlockSelector).html(tierPriceHtml).show();
                }
            } else {
                $(this.options.tierPriceBlockSelector).hide();
            }

            $productPrice.find(this.options.normalPriceLabelSelector)
                .toggle(this._CalcProducts().length !== 1);
        },

        /**
         * Get new prices for selected options
         *
         * @returns {*}
         * @private
         */
        _getNewPrices: function () {
            var $widget = this,
                newPrices = $widget.options.jsonConfig.prices,
                allowedProduct = this._getAllowedProductWithMinPrice(this._CalcProducts());

            if (!_.isEmpty(allowedProduct)) {
                newPrices = this.options.jsonConfig.optionPrices[allowedProduct];
            }

            return newPrices;
        },

        /**
         * Get prices
         *
         * @param {Object} newPrices
         * @param {Object} displayPrices
         * @returns {*}
         * @private
         */
        _getPrices: function (newPrices, displayPrices) {
            var $widget = this;

            if (_.isEmpty(newPrices)) {
                newPrices = $widget._getNewPrices();
            }
            _.each(displayPrices, function (price, code) {

                if (newPrices[code]) {
                    displayPrices[code].amount = newPrices[code].amount - displayPrices[code].amount;
                }
            });

            return displayPrices;
        },

        /**
         * Get product with minimum price from selected options.
         *
         * @param {Array} allowedProducts
         * @returns {String}
         * @private
         */
        _getAllowedProductWithMinPrice: function (allowedProducts) {
            var optionPrices = this.options.jsonConfig.optionPrices,
                product = {},
                optionFinalPrice, optionMinPrice;

            _.each(allowedProducts, function (allowedProduct) {
                optionFinalPrice = parseFloat(optionPrices[allowedProduct].finalPrice.amount);

                if (_.isEmpty(product) || optionFinalPrice < optionMinPrice) {
                    optionMinPrice = optionFinalPrice;
                    product = allowedProduct;
                }
            }, this);

            return product;
        },

        /**
         * Emulate mouse click on all swatches that should be selected
         * @param {Object} [selectedAttributes]
         * @private
         */
        _EmulateSelected: function (selectedAttributes) {
            var $widget = this;

            if (_.some(selectedAttributes, function (value, attributeCode) {
                var item = _.findWhere($widget.attributes, { code: attributeCode }),
                    field = item && item.element;

                if (!field) return false;

                setSwatchOptionSelected($widget, item, value);
                $widget._Rebuild();
                return true;
            })) {
                $widget._UpdatePrice();
                $widget._loadMedia();
            }
        }
    });

    return $.mage.SwatchRenderer;

    function setSwatchOptionSelected ($widget, attribute, value) {
        var field = attribute && attribute.element;
        if (field && value) {
            var swatchOption = field.find('[value=' + value + ']')
                .parent('.' + $widget.options.classes.optionClass);

            if (swatchOption.length) {
                $widget._OnClick(swatchOption, $widget);
            } else {
                field.find('select').val(value);
            }
        }
    }
});
