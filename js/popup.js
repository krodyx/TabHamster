chrome.storage.local.get(function (session_items) {
    chrome.storage.sync.get(function (items) {
        /**
         * Popup window for edit operation
         * @param popup_id
         * @param callback {function} fired on submit.
         */
        function Popup(popup_id, callback) {
            this.popup_container = document.querySelector('#' + popup_id);
            this.callback = callback;
            this.go();
        }

        Popup.prototype = {
            go: function () {
                var self = this,
                    data_container = self.popup_container.querySelectorAll('.data');

                function submitData() {
                    var data = {};
                    [].forEach.call(data_container, function (el) {
                        data[el.id] = el.value;
                    });
                    self.popup_container.style.display = 'none';
                    self.callback(data);
                }

                this.popup_container.style.display = 'block';
                data_container[0].focus();
                data_container[0].select();
                this.popup_container.querySelector('.submit_btn').onclick = function (e) {
                    submitData();
                };
                // submit on 'enter' for last text input
                if (data_container[data_container.length - 1].getAttribute('type') === 'text') {
                    data_container[data_container.length - 1].onkeyup = function (e) {
                        if (e.keyCode === 13) {
                            submitData();
                        }
                    };
                }
                this.popup_container.querySelector('.cancel').onclick = function (e) {
                    self.popup_container.style.display = 'none';
                };
            }
        };


        function GroupModel(area) {
            this.storageArea = (function () {
                return area === 'session' ? chrome.storage.local : chrome.storage.sync;
            }());
            // all saved groups as object
            this.data_local_copy = (function () {
                var item,
                    groups_data = (function () {
                        return area === 'session' ? session_items : items;
                    }()),
                    obj = {};
                for (item in groups_data) {
                    if (item.indexOf('tg_') === 0) {
                        obj[item] = groups_data[item];
                    }
                }
                return obj;
            }());
        }

        GroupModel.prototype = {
            getGroups: function () {
                return this.data_local_copy;
            },
            nextIndex: function () {
                var last_index = 0,
                    group;
                for (group in this.data_local_copy) {
                    if (this.data_local_copy[group].index > last_index) {
                        last_index = this.data_local_copy[group].index;
                    }
                }
                return last_index + 1;
            },
            del: function (storage_name, callback) {
                var self = this;
                this.storageArea.remove(storage_name, function () {
                    if (!chrome.runtime.lastError) {
                        delete self.data_local_copy[storage_name];
                        callback({err: 0});
                    } else {
                        callback({err: 1, msg: chrome.runtime.lastError.message});
                    }
                });
            },

            add: function (name, group, callback) {
                var now = new Date(),
                    new_group = {},
                    storage_name = 'tg_' + now.getTime(),
                    self = this;
                new_group[storage_name] = {
                    name: name === undefined || name.length === 0 ? '' : name,
                    index: this.nextIndex(),
                    color: '', // TODO personal color for each group
                    tabs: group
                };
                this.storageArea.set(new_group, function () {
                    if (!chrome.runtime.lastError) {
                        self.data_local_copy[storage_name] = new_group[storage_name];
                        callback({err: 0, storage_name: storage_name, new_group: new_group[storage_name]});
                    } else {
                        callback({err: 1, msg: chrome.runtime.lastError.message});
                    }
                });
            },

            upd: function (storage_name, value, callback) {
                var obj = {},
                    self = this;
                obj[storage_name] = value;
                this.storageArea.set(obj, function () {
                    if (!chrome.runtime.lastError) {
                        self.data_local_copy[storage_name] = value;
                        callback({err: 0, storage_name: storage_name, new_group: obj[storage_name]});
                    } else {
                        callback({err: 1, msg: chrome.runtime.lastError.message});
                    }
                });
            },

            move: function (storage_name, sibling_storage_name, callback) {
                var self = this,
                    obj = {},
                    sibling_obj = {},
                    i = this.data_local_copy[storage_name].index;
                obj[storage_name] = this.data_local_copy[storage_name];
                obj[storage_name].index = this.data_local_copy[sibling_storage_name].index;
                sibling_obj[sibling_storage_name] = this.data_local_copy[sibling_storage_name];
                sibling_obj[sibling_storage_name].index = i;
                this.storageArea.set(obj, function () {
                    if (!chrome.runtime.lastError) {
                        self.storageArea.set(sibling_obj, function () {
                            if (!chrome.runtime.lastError) {
                                self.data_local_copy[storage_name] = obj[storage_name];
                                self.data_local_copy[sibling_storage_name] = sibling_obj[sibling_storage_name];
                                callback({err: 0});
                            } else {
                                callback({err: 1, msg: chrome.runtime.lastError.message});
                            }
                        });
                    } else {
                        callback({err: 1, msg: chrome.runtime.lastError.message});
                    }
                });
            }
        };


        function LinkModel(area) {
            this.storage = (function () {
                return area === 'session' ? chrome.storage.local : chrome.storage.sync;
            }());
            this.model = area === 'session' ? sessionModel : groupModel;
        }

        LinkModel.prototype = {
            getLocalLinkIndexById: function (storage_name, link_id) {
                var i,
                    tabs = (this.model.getGroups())[storage_name].tabs,
                    max = tabs.length;
                for (i = 0; i < max; i++) {
                    if (tabs[i].id === parseInt(link_id, 10)) {
                        return i;
                    }
                }
            },
            groupLinksByWindowId: function (storage_name) {
                var tabs = (this.model.getGroups())[storage_name].tabs,
                    windows = [], // arr with unique windowId
                    grouped_by_windows = []; // links grouped by windowId [[{tab1}, {tab2}],[{tab3}]]...
                tabs.forEach(function (el) {
                    var window_index = windows.indexOf(el.windowId);
                    if (window_index === -1) {
                        windows.push(el.windowId);
                        grouped_by_windows.push([]);
                        grouped_by_windows[windows.length - 1].push(el);
                    } else {
                        grouped_by_windows[window_index].push(el);
                    }
                });
                return {grouped_by_windowId: grouped_by_windows, windowId_arr: windows};
            },
            nextIndex: function (storage_name) {
                var tabs = (this.model.getGroups())[storage_name].tabs,
                    last_index = 0;
                tabs.forEach(function (el) {
                    if (el.id > last_index) {
                        last_index = el.id;
                    }
                });
                return last_index + 1;
            },
            del: function (storage_name, link_id, callback) {
                var group = (this.model.getGroups())[storage_name];
                group.tabs.splice(this.getLocalLinkIndexById(storage_name, link_id), 1);
                this.model.upd(storage_name, group, function (answ) {
                    callback(answ);
                });
            },
            add: function (storage_name, link_data, callback) {
                var group = (this.model.getGroups())[storage_name];
                group.tabs.push(link_data);
                this.model.upd(storage_name, group, function (answ) {
                    callback(answ);
                });
            },
            upd: function (storage_name, link_index, link_data, callback) {
                var group = (this.model.getGroups())[storage_name];
                group.tabs[link_index] = link_data;
                this.model.upd(storage_name, group, function (answ) {
                    callback(answ);
                });
            }
        };

        var groupModel = new GroupModel('saved'),
            linkModel = new LinkModel('saved'),
            sessionModel = new GroupModel('session'),
            sessionLinkModel = new LinkModel('session'),
            ui_msg = {
                title_del_group: chrome.i18n.getMessage('p_delGroup_btn_title'),
                title_edit_group_name: chrome.i18n.getMessage('p_editGroupName_btn_title'),
                title_add_link_to_group: chrome.i18n.getMessage('p_addLinkToGroup_btn_title'),
                title_group_in_new_window: chrome.i18n.getMessage('p_groupInNewWindow_btn_title'),
                title_edit_link: chrome.i18n.getMessage('p_editLink_btn_title'),
                title_del_link: chrome.i18n.getMessage('p_delLinkFromGroup_btn_title'),
                title_up_link: chrome.i18n.getMessage('p_upGroup_btn_title'),
                title_down_link: chrome.i18n.getMessage('p_downGroup_btn_title'),

                windows_numbers: chrome.i18n.getMessage('p_windowsNumbers_text'),
                tabs_numbers: chrome.i18n.getMessage('p_tabsNumbers_text'),

                window_text: chrome.i18n.getMessage('p_window_text'),

                quota_bytes_item: chrome.i18n.getMessage('p_quotaBites_error'),
                quota_default_item: chrome.i18n.getMessage('p_syncStorageDefault_error'),
                quota_bytes_per_item: chrome.i18n.getMessage('p_quotaBitesPerItem_error'),

                current_session: chrome.i18n.getMessage('p_currentSession')
            },
            tabsGrabber = {
                tabsFilter: function () {
                    return {
                        currentWindow: items.cur_win === 0 ? false : true
                    };
                },
                collectTabs: function (callback) {
                    chrome.tabs.query(this.tabsFilter(), function (tabs) {
                        var links = [];
                        tabs.forEach(function (tab, index) {
                            var link = {};
                            if (!tab.pinned || items.pinned === 1) {
                                link.url = tab.url;
                                link.title = tab.title;
                                link.id = index;
                                links.push(link);
                            }
                        });
                        callback(links);
                    });
                }
            },


            savedUI = {
                groupHtmlElement: function (storage_name, group) {
                    var title = group.name;
                    if (group.name === '') {
                        title = utils.formatDate(new Date(parseInt(storage_name.slice('tg_'.length), 10)), items.date_format);
                    }
                    return '<div id="' + storage_name + '" class="group">' +
                        '<span class="spoiler" name = "closed"> &#9658;</span>' +
                        '<span class="open_group">' + title + '</span>' +
                        '<span class="open_in_new_window" title="' + ui_msg.title_group_in_new_window + '">&#10064;</span> ' +
                        '<span class="group_action">' +
                        '<span class="add_link" title="' + ui_msg.title_add_link_to_group + '">&#10010;</span>' +
                        '<span class="up" title="' + ui_msg.title_up_link + '">&#9650;</span>' +
                        '<span class="down" title="' + ui_msg.title_down_link + '">&#9660;</span>' +
                        '<span class="edit_group" title="' + ui_msg.title_edit_group_name + '">&#9776;</span>' +
                        '<span class="del_group" title="' + ui_msg.title_del_group + '">&#10006;</span>' +
                        '</span>' +
                        '</div>';
                },
                linkHtmlElement: function (storage_name, link) {
                    var a_text = link.title,
                        a_title = '',
                        text_length = 48,
                        favicon_src = localStorage.browser === 'chrome' ? 'chrome://favicon/' + link.url : 'opera://favicon/' + link.url;
                    if (link.title.length > text_length) {
                        a_text = link.title.slice(0, text_length) + '...';
                        a_title = 'title="' + link.title + '"';
                    }
                    return '<div id="' + storage_name + '_' + link.id + '" class="link">' +
                        '<span class="link_action">' +
                        '<span class="edit_link" title="' + ui_msg.title_edit_link + '">&#9776;</span>' +
                        '<span class="del_link" title="' + ui_msg.title_del_link + '">&#10006;</span>' +
                        '<a href="' + link.url + '" target="_blank" ' + a_title + '>' +
                        '<span class="favi" title="' + link.url + '"><img src="' + favicon_src + '"></span>' + a_text + '</a>' +
                        '</span>' +
                        '</div>';
                },
                openGroup: function (storage_name, mouse_button) {
                    // mouse_button = 0  - cur window, 1 - new
                    var tabs = (groupModel.getGroups())[storage_name].tabs,
                        urls = [];
                    window.close();
                    tabs.forEach(function (el) {
                        urls.push(el.url);
                    });
                    if (mouse_button === 1) {
                        chrome.windows.create({'url': urls, 'type': 'normal', 'focused': true});
                    } else {
                        urls.forEach(function (el) {
                            chrome.tabs.create({'url': el});
                        });
                    }
                },
                showGroups: function () {
                    var html = '<section id="error_msg"></section>',
                        self = this,
                        groups = groupModel.getGroups(),
                        tag = document.getElementById('saved'),
                        sorted_group_list = Object.keys(groups).sort(function (a, b) {
                            return groups[b].index - groups[a].index;
                        });
                    sorted_group_list.forEach(function (el) {
                        html += self.groupHtmlElement(el, groups[el]);
                    });
                    tag.innerHTML = html;
                    this.showSyncStorageUsage();
                },
                addGroup: function () {
                    var input_field = document.getElementById('new_group_name'),
                        name = input_field.value,
                        self = this;
                    input_field.value = '';
                    tabsGrabber.collectTabs(function (tabs) {
                        groupModel.add(name, tabs, function (answ) {
                            var el, groups_el;
                            if (answ.err === 0) {
                                self.showSyncStorageUsage();
                                el = document.createElement("div");
                                groups_el = document.getElementById('saved');
                                el.innerHTML = self.groupHtmlElement(answ.storage_name, answ.new_group);
                                groups_el.insertBefore(el, groups_el.getElementsByTagName('div')[0]);
                                groups_el.innerHTML = groups_el.innerHTML.replace(/(<div>)*|(<\/div>)*/g, '');
                            } else {
                                self.showErrorMsg(answ.msg);
                            }
                        });
                    });
                },
                editGroupName: function (storage_name, el) {
                    var group = (groupModel.getGroups())[storage_name],
                        new_name,
                        popup,
                        self = this;
                    document.getElementById('popup-new_group_name').value = group.name;
                    popup = new Popup('edit_group_name', function (data) {
                        new_name = data['popup-new_group_name'];
                        if (new_name !== undefined || new_name !== '') {
                            group.name = new_name;
                            groupModel.upd(storage_name, group, function (answ) {
                                if (answ.err === 0) {
                                    el.getElementsByClassName('open_group')[0].innerText = new_name;
                                    self.showSyncStorageUsage();
                                } else {
                                    self.showErrorMsg(answ.msg);
                                }
                            });
                        }

                    });
                },
                delGroup: function (storage_name, el) {
                    var self = this;
                    groupModel.del(storage_name, function (answ) {
                        if (answ.err === 0) {
                            el.remove();
                            self.showSyncStorageUsage();
                        } else {
                            self.showErrorMsg(answ.msg);
                        }
                    });
                },
                moveGroup: function (storage_name, sibling_storage_name) {
                    var self = this;
                    groupModel.move(storage_name, sibling_storage_name, function (answ) {
                        if (answ.err === 0) {
                            self.showGroups();
                        } else {
                            self.showErrorMsg(answ.msg);
                        }
                    });
                },
                showGroupLinks: function (storage_name, el) {
                    var link_list = document.createElement("div"),
                        spoiler = el.getElementsByClassName('spoiler')[0],
                        html = '',
                        self = this;

                    (groupModel.getGroups())[storage_name].tabs.forEach(function (el) {
                        html += self.linkHtmlElement(storage_name, el);
                    });
                    link_list.classList.add('links');
                    link_list.innerHTML = html;
                    el.insertBefore(link_list);
                    spoiler.setAttribute('name', 'opened');
                    spoiler.innerHTML = ' &#9660;';
                },
                hideGroupLinks: function (el) {
                    var spoiler = el.getElementsByClassName('spoiler')[0];
                    spoiler.setAttribute('name', 'closed');
                    spoiler.innerHTML = ' &#9658;';
                    el.getElementsByClassName('links')[0].remove();
                },
                delLink: function (storage_name, link_id, el) {
                    linkModel.del(storage_name, link_id, function (answ) {
                        if (answ.err === 0) {
                            el.remove();
                        }
                    });
                },
                addLink: function (storage_name, el) {
                    var self = this,
                        popup = new Popup('add_link', function (data) {
                            var obj = {
                                id: linkModel.nextIndex(storage_name),
                                title: data['popup-add_link_name'],
                                url: utils.correctUrl(data['popup-add_link_link'])
                            };
                            linkModel.add(storage_name, obj, function (answ) {
                                if (answ.err === 0) {
                                    var links_div = el.getElementsByClassName('links');
                                    if (links_div.length) {
                                        self.hideGroupLinks(el);
                                    }
                                    self.showGroupLinks(storage_name, el);
                                    self.showSyncStorageUsage();
                                } else {
                                    self.showErrorMsg(answ.msg);
                                }
                            });
                        });
                },
                editLink: function (storage_name, link_id, el) {
                    var group_node = el.parentNode.parentNode,
                        tabs = (groupModel.getGroups())[storage_name].tabs,
                        link_index = linkModel.getLocalLinkIndexById(storage_name, link_id),
                        popup,
                        self = this;
                    document.getElementById('popup-edit_link_name').value = tabs[link_index].title;
                    document.getElementById('popup-edit_link_url').value = tabs[link_index].url;
                    popup = new Popup('edit_link', function (data) {
                        var link_data = tabs[link_index];
                        link_data.title = data['popup-edit_link_name'];
                        link_data.url = utils.correctUrl(data['popup-edit_link_url']);
                        linkModel.upd(storage_name, link_index, link_data, function (answ) {
                            if (answ.err === 0) {
                                self.hideGroupLinks(group_node);
                                self.showGroupLinks(storage_name, group_node);
                                self.showSyncStorageUsage();
                            } else {
                                self.showErrorMsg(answ.msg);
                            }
                        });
                    });
                },
                showErrorMsg: function (msg) {
                    var el = document.getElementById('error_msg'),
                        text = ui_msg.quota_default_item;
                    el.style.display = 'block';
                    switch (msg) {
                    case 'QUOTA_BYTES_PER_ITEM quota exceeded.':
                        text = ui_msg.quota_bytes_per_item;
                        break;
                    case 'QUOTA_BYTES quota exceeded.':
                        text = ui_msg.quota_bytes_item;
                        break;
                    }
                    el.innerText = text;
                    setTimeout(function () {
                        el.style.display = 'none';
                    }, 4581);
                },

                showSyncStorageUsage: function () {
                    chrome.storage.sync.getBytesInUse(null, function (bytesInUse) {
                        var percent_in_use = (bytesInUse * 100 / chrome.storage.sync.QUOTA_BYTES).toFixed(2),
                            el = document.querySelector('ul.tabs_nav>li a'),
                            text = el.innerText;
                        el.innerText = text.slice(0, text.indexOf('|')) + '| ' + percent_in_use + '%';
                    });
                },

                setHandlers: function () {
                    var self = this,
                        saved = document.getElementById('saved');

                    document.getElementById('new_group').addEventListener('click', function (e) {
                        e.preventDefault();
                        self.addGroup();
                    }, false);

                    document.getElementById('new_group_name').addEventListener('keyup', function (e) {
                        if (e.keyCode === 13) {
                            self.addGroup();
                        }
                    }, false);

                    saved.addEventListener('click', function (e) {
                        function linkInfo(link_node_id) {
                            return {
                                storage_name: link_node_id.slice(0, link_node_id.lastIndexOf('_')),
                                id: link_node_id.slice(link_node_id.lastIndexOf('_') + 1)
                            };
                        }
                        var el = e.target,
                            group_node,
                            link_node,
                            link_node_id,
                            storage_group_name,
                            link_id,
                            btn,
                            sibling,
                            link;
                        e.stopPropagation();
                        switch (el.className) {
                        case 'open_group':
                            // e.button - 0 - left mouse click (cur win), 1 - mouse wheel click (new win)
                            // mouse wheel works only with no scroll
                            btn = e.button;
                            if (btn === 0 && e.ctrlKey === true) {
                                self.openGroup(el.parentNode.id, 1);
                            } else {
                                self.openGroup(el.parentNode.id, e.button);
                            }
                            break;
                        case 'open_in_new_window':
                            // e.button - 0 - left mouse click (cur win), 1 - mouse wheel click (new win)
                            self.openGroup(el.parentNode.id, 1);
                            break;
                        case 'up':
                            group_node = el.parentNode.parentNode;
                            sibling = group_node.previousSibling;
                            if (sibling && sibling.className === 'group') {
                                self.moveGroup(group_node.id, sibling.id);
                            }
                            break;
                        case 'down':
                            group_node = el.parentNode.parentNode;
                            sibling = group_node.nextSibling;
                            if (sibling && sibling.className === 'group') {
                                self.moveGroup(group_node.id, sibling.id);
                            }
                            break;
                        case 'del_group':
                            group_node = el.parentNode.parentNode;
                            self.delGroup(group_node.id, group_node);
                            break;
                        case 'edit_group':
                            group_node = el.parentNode.parentNode;
                            self.editGroupName(group_node.id, group_node);
                            break;
                        case 'add_link':
                            group_node = el.parentNode.parentNode;
                            self.addLink(group_node.id, group_node);
                            break;
                        case 'spoiler':
                            group_node = el.parentNode;
                            if (el.getAttribute('name') === 'closed') {
                                self.showGroupLinks(group_node.id, group_node);
                            } else {
                                self.hideGroupLinks(group_node);
                            }
                            break;
                        case 'del_link':
                            link_node = el.parentNode.parentNode;
                            link = linkInfo(link_node.id);
                            self.delLink(link.storage_name, link.id, link_node);
                            break;
                        case 'edit_link':
                            link_node = el.parentNode.parentNode;
                            link = linkInfo(link_node.id);
                            self.editLink(link.storage_name, link.id, link_node);
                            break;
                        }

                    }, false);

                },
                go: function () {
                    this.showGroups();
                    this.setHandlers();
                }
            },


            sessionsUI = {
                groupHtmlElement: function (storage_name, group) {
                    var title,
                        date = utils.formatDate(new Date(parseInt(storage_name.slice('tg_'.length), 10)), items.date_format),
                        group_info = (function () {
                            return {
                                numbers_of_windows: sessionLinkModel.groupLinksByWindowId(storage_name).windowId_arr.length,
                                numbers_of_tabs: (sessionModel.getGroups())[storage_name].tabs.length
                            };
                        }());
                    if (group.name === '') {
                        title = date;
                    }
                    if (storage_name === localStorage.session_id) {
                        title = ui_msg.current_session + ' (' + date + ')';
                    }
                    return '<div id="' + storage_name + '" class="group">' +
                        '<span class="spoiler" name = "closed"> &#9658;</span>' +
                        '<span class="open_group">' + title + '</span>' +
                        '<span class="open_in_new_window" title="' + ui_msg.title_group_in_new_window + '">&#10064;</span> ' +
                        '<span class="numbers_of_windows">' + ui_msg.windows_numbers + ' ' + group_info.numbers_of_windows + '</span>' +
                        '<span class="numbers_of_tabs">' + ui_msg.tabs_numbers + ' ' + group_info.numbers_of_tabs + '</span>' +
                        '<span class="group_action">' +
                        '<span class="del_group" title="' + ui_msg.title_del_group + '">&#10006;</span>' +
                        '</span>' +
                        '</div>';
                },

                linkHtmlElement: function (storage_name, link) {
                    var a_text = link.title,
                        a_title = '',
                        text_length = 44,
                        pin_icon = link.pinned === true ? '<img class="pinned_icon" src="img/pin-26.png">' : '',
                        favicon_src = localStorage.browser === 'chrome' ? 'chrome://favicon/' + link.url : 'opera://favicon/' + link.url;
                    if (link.title.length > text_length) {
                        a_text = link.title.slice(0, text_length) + '...';
                        a_title = 'title="' + link.title + '"';
                    }
                    return '<div class="link">' +
                        '<span class="link_action">' +
//                        '<span class="del_link" title="' + ui_msg.title_del_link + '">&#10006;</span>' +
                        '<a href="' + link.url + '" target="_blank" ' + a_title + '>' +
                        '<span class="favi" title="' + link.url + '"><img src="' + favicon_src + '"></span>' + pin_icon + a_text + '</a>' +
                        '</span>' +
                        '</div>';
                },
                openGroup: function (storage_name, mouse_button) {
                    // mouse_button = 0  - cur window, 1 - new
                    var grouped,
                        links = [];
                    window.close();
                    if (mouse_button === 1) {
                        grouped = sessionLinkModel.groupLinksByWindowId(storage_name);
                        grouped.windowId_arr.forEach(function (el, index) {
                            links = [];
                            grouped.grouped_by_windowId[index].forEach(function (link) {
                                links.push(link.url);
                            });
                            chrome.windows.create({'url': links, 'type': 'normal', 'focused': true});
                        });
                    } else {
                        (sessionModel.getGroups())[storage_name].tabs.forEach(function (el) {
                            chrome.tabs.create({'url': el.url});
                        });
                    }
                },
                openWindow: function (storage_name, window_id, mouse_button) {
                    // mouse_button = 0  - cur window, 1 - new
                    var tabs = (sessionModel.getGroups())[storage_name].tabs,
                        links = [];
                    window.close();
                    if (mouse_button === 1) {
                        tabs.forEach(function (el) {
                            if (el.windowId === parseInt(window_id, 10)) {
                                links.push(el.url);
                            }
                        });
                        chrome.windows.create({'url': links, 'type': 'normal', 'focused': true});
                    } else {
                        tabs.forEach(function (el) {
                            if (el.windowId === parseInt(window_id, 10)) {
                                chrome.tabs.create({'url': el.url});
                            }
                        });
                    }
                },
                showGroups: function () {
                    var html = '<section id="sessions_error_msg"></section>',
                        groups = sessionModel.getGroups(),
                        self = this,
                        tag = document.getElementById('sessions'),
                        sorted_names_list = Object.keys(groups).sort(function (a, b) {
                            return parseInt(b.slice('tg_'.length), 10) - parseInt(a.slice('tg_'.length), 10);
                        });
                    sorted_names_list.forEach(function (el) {
                        html += self.groupHtmlElement(el, groups[el]);
                    });
                    tag.innerHTML = html;
                },
                delGroup: function (storage_name, el) {
                    var self = this;
                    sessionModel.del(storage_name, function (answ) {
                        if (answ.err === 0) {
                            el.remove();
                        } else {
                            self.showErrorMsg(answ.msg);
                        }
                    });
                },
                showGroupLinks: function (storage_name, el) {
                    var link_list = document.createElement("div"),
                        spoiler = el.getElementsByClassName('spoiler')[0],
                        html = '',
                        self = this,
                        grouped_links = sessionLinkModel.groupLinksByWindowId(storage_name);

                    grouped_links.grouped_by_windowId.forEach(function (link_arr, ind) {
                        var win_html = '<div class="win">' +
                            '<div class="win_title" id="' + storage_name + '_' + grouped_links.windowId_arr[ind] + '">&#9642; ' + ui_msg.window_text + ' ' + (ind + 1) + '</div>';

                        link_arr.forEach(function (link) {
                            win_html += self.linkHtmlElement(storage_name, link);
                        });
                        win_html += '</div>';
                        html += win_html;
                    });
                    link_list.classList.add('links');
                    link_list.innerHTML = html;
                    el.insertBefore(link_list);
                    spoiler.setAttribute('name', 'opened');
                    spoiler.innerHTML = ' &#9660;';
                },
                hideGroupLinks: function (el) {
                    var spoiler = el.getElementsByClassName('spoiler')[0];
                    spoiler.setAttribute('name', 'closed');
                    spoiler.innerHTML = ' &#9658;';
                    el.getElementsByClassName('links')[0].remove();
                },
                setHandlers: function () {
                    var self = this;
                    document.getElementById('sessions').addEventListener('click', function (e) {
                        var el = e.target,
                            group_node,
                            btn,
                            win_info;
                        e.stopPropagation();
                        switch (el.className) {
                        case 'del_group':
                            group_node = el.parentNode.parentNode;
                            self.delGroup(group_node.id, group_node);
                            break;
                        case 'spoiler':
                            group_node = el.parentNode;
                            if (el.getAttribute('name') === 'closed') {
                                self.showGroupLinks(group_node.id, group_node);
                            } else {
                                self.hideGroupLinks(group_node);
                            }
                            break;
                        case 'open_group':
                            // e.button - 0 - left mouse click (cur win), 1 - mouse wheel click (new win)
                            // mouse wheel works only with no scroll
                            btn = e.button;
                            if (btn === 0 && e.ctrlKey === true) {
                                self.openGroup(el.parentNode.id, 1);
                            } else {
                                self.openGroup(el.parentNode.id, e.button);
                            }
                            break;
                        case 'open_in_new_window':
                            // e.button - 0 - left mouse click (cur win), 1 - mouse wheel click (new win)
                            self.openGroup(el.parentNode.id, 1);
                            break;
                        case 'win_title':
                            // e.button - 0 - left mouse click (cur win), 1 - mouse wheel click (new win)
                            // mouse wheel works only with no scroll
                            btn = e.button;
                            win_info = (function () {
                                var win_id_start = el.id.lastIndexOf('_');
                                return {storage_name: el.id.slice(0, win_id_start), window_id: el.id.slice(win_id_start + 1)};
                            }());
                            if (btn === 0 && e.ctrlKey === true) {
                                self.openWindow(win_info.storage_name, win_info.window_id, 1);
                            } else {
                                self.openWindow(win_info.storage_name, win_info.window_id, 0);
                            }
                            break;
                        }

                    }, false);
                },
                go: function () {
                    this.showGroups();
                    this.setHandlers();
                }
            },

//            mainUI =

            navigation;

        if (!chrome.runtime.lastError) {
            /* window tab navigation */
            navigation = new Tabs('#main_tabs');
            navigation.toggle(items.active_tab);
            navigation.onToggle(function (tab_name) {
                chrome.storage.sync.set({active_tab: tab_name});
            });
            /* popup tab END */

            sessionsUI.go();
            savedUI.go();

        } else {
            // show sycn storage error
            document.getElementById('error_msg').style.display = 'block';
            document.getElementById('error_msg').innerText = ui_msg.quota_default_item;
        }
    });
});
// TODO blink group el after create, move
// TODO place special icon for pinned tabs
// TODO hоt keys