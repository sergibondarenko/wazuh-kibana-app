/*
 * Wazuh app - Settings controller
 * Copyright (C) 2018 Wazuh, Inc.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * Find more information about this on the LICENSE file.
 */
import base64        from '../utils/base64.js'
import chrome        from 'ui/chrome'
import { uiModules } from 'ui/modules'
import TabNames      from '../utils/tab-names'

const app = uiModules.get('app/wazuh', []);

app.controller('settingsController', function ($scope, $rootScope, $http, $routeParams, $route, $location, testAPI, appState, genericReq, errorHandler, wzMisc) {
    if (wzMisc.getValue('comeFromWizard')) {
        sessionStorage.removeItem('healthCheck');
        wzMisc.setWizard(false)
    }

    $scope.apiIsDown = wzMisc.getValue('apiIsDown');

    // Initialize
    let currentApiEntryIndex;
    $scope.formData            = {};
    $scope.tab                 = 'api';
    $scope.load                = true;
    $scope.addManagerContainer = false;
    $scope.showEditForm        = {};
    $scope.formUpdate          = {};

    const userRegEx  = new RegExp(/^.{3,100}$/);
    const passRegEx  = new RegExp(/^.{3,100}$/);
    const urlRegEx   = new RegExp(/^https?:\/\/[a-zA-Z0-9-.]{1,300}$/);
    const urlRegExIP = new RegExp(/^https?:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/);
    const portRegEx  = new RegExp(/^[0-9]{2,5}$/);

    // Tab names
    $scope.tabNames = TabNames;

    $scope.indexPatterns = [];
    $scope.apiEntries    = [];

    if ($routeParams.tab){
        $scope.tab = $routeParams.tab;
    }

    $scope.switchTab = tab => {
        $scope.tab = tab;
        $location.search('tab', $scope.tab);
    }

    // Remove API entry
    $scope.removeManager = async item => {
        try {

            let index = $scope.apiEntries.indexOf(item);
            if (appState.getCurrentAPI() !== undefined && appState.getCurrentAPI() !== null) {
                if ($scope.apiEntries[index]._id === JSON.parse(appState.getCurrentAPI()).id) { // We are trying to remove the one selected as default
                    errorHandler.handle("Can't delete the currently selected API. Please, select another API as default before deleting this one.",'Settings',true);
                    return;
                }
            }
            await genericReq.request('DELETE', `/api/wazuh-api/apiEntries/${$scope.apiEntries[index]._id}`);
            $scope.showEditForm[$scope.apiEntries[index]._id] = false;
            $scope.apiEntries.splice(index, 1);
            wzMisc.setApiIsDown(false)
            $scope.apiIsDown = false;
            $scope.isEditing = false;
            for(const key in $scope.showEditForm) $scope.showEditForm[key] = false;
            errorHandler.info('The API was removed successfully','Settings');
            if(!$scope.$$phase) $scope.$digest();
            return;
        } catch(error) {
            errorHandler.handle('Could not remove the API','Settings');
        }
        return;
    };

    // Get current API index
    const getCurrentAPIIndex = () => {
        $scope.apiEntries.map((entry,index,array) => {
            if(entry._id === $scope.currentDefault) currentApiEntryIndex = index;
        })
    }

    const sortByTimestamp = (a,b) => {
        const intA = parseInt(a._id);
        const intB = parseInt(b._id);
        return intA > intB ? -1 : intA < intB ? 1 : 0;
    };

    // Set default API
    $scope.setDefault = (item) => {
        const index = $scope.apiEntries.indexOf(item);

        appState.setClusterInfo($scope.apiEntries[index]._source.cluster_info);

        if ($scope.apiEntries[index]._source.cluster_info.status == 'disabled'){
            appState.setCurrentAPI(JSON.stringify({name: $scope.apiEntries[index]._source.cluster_info.manager, id: $scope.apiEntries[index]._id }));
        } else {
            appState.setCurrentAPI(JSON.stringify({name: $scope.apiEntries[index]._source.cluster_info.cluster, id: $scope.apiEntries[index]._id }));
        }

        $scope.$emit('updateAPI', {});

        const currentApi = appState.getCurrentAPI();
        $scope.currentDefault = JSON.parse(currentApi).id;

        errorHandler.info(`API ${$scope.apiEntries[index]._source.cluster_info.manager} set as default`,'Settings');

        getCurrentAPIIndex();

        if(currentApi && !appState.getExtensions(JSON.parse(currentApi).id)){
            appState.setExtensions($scope.apiEntries[currentApiEntryIndex]._id,$scope.apiEntries[currentApiEntryIndex]._source.extensions);
        }

        $scope.extensions = appState.getExtensions(JSON.parse(currentApi).id);

        if(!$scope.$$phase) $scope.$digest();
        return;
    };

    // Get settings function
    const getSettings = async () => {
        try {
            const patternList = await genericReq.request('GET','/get-list',{});
            $scope.indexPatterns = patternList.data.data;

            if(!patternList.data.data.length){
                wzMisc.setBlankScr('Sorry but no valid index patterns were found')
                $location.search('tab',null);
                $location.path('/blank-screen');
                return;
            }
            const data = await genericReq.request('GET', '/api/wazuh-api/apiEntries');
            for(const entry of data.data) $scope.showEditForm[entry._id] = false;

            $scope.apiEntries = data.data.length > 0 ? data.data : [];
            $scope.apiEntries = $scope.apiEntries.sort(sortByTimestamp);

            const currentApi = appState.getCurrentAPI();

            if (currentApi){
                $scope.currentDefault = JSON.parse(currentApi).id;
            }

            if(!$scope.$$phase) $scope.$digest();
            getCurrentAPIIndex();
            if(!currentApiEntryIndex) return;

            if(currentApi && !appState.getExtensions(JSON.parse(currentApi).id)){
                appState.setExtensions($scope.apiEntries[currentApiEntryIndex]._id,$scope.apiEntries[currentApiEntryIndex]._source.extensions);
            }

            $scope.extensions = appState.getExtensions(JSON.parse(currentApi).id);

            if(!$scope.$$phase) $scope.$digest();
            return;
        } catch (error) {
            errorHandler.handle('Error getting API entries','Settings');
        }
        return;
    };

    const validator = formName => {
        // Validate user
        if(!userRegEx.test($scope[formName].user)){
            return 'Invalid user field';
        }

        // Validate password
        if(!passRegEx.test($scope[formName].password)){
            return 'Invalid password field';
        }

        // Validate url
        if(!urlRegEx.test($scope[formName].url) && !urlRegExIP.test($scope[formName].url)){
            return 'Invalid url field';
        }

        // Validate port
        const validatePort = parseInt($scope[formName].port);
        if(!portRegEx.test($scope[formName].port) || validatePort <= 0 || validatePort >= 99999) {
            return 'Invalid port field';
        }

        return false;
    }

    $scope.toggleEditor = entry => {
        if($scope.formUpdate && $scope.formUpdate.password) {
            $scope.formUpdate.password = '';
        }
        for(const key in $scope.showEditForm) {
            if(entry && entry._id === key) continue;
            $scope.showEditForm[key] = false;
        }
        $scope.showEditForm[entry._id] = !$scope.showEditForm[entry._id];
        $scope.isEditing = $scope.showEditForm[entry._id];
        $scope.addManagerContainer = false;
        if(!$scope.$$phase) $scope.$digest();
    }

    // Save settings function
    $scope.saveSettings = async () => {
        try {
            $scope.messageError = "";
            $scope.isEditing = false;
            const invalid = validator('formData');

            if(invalid) {
                $scope.messageError = invalid;
                errorHandler.handle(invalid,'Settings');
                return;
            }

            const tmpData = {
                user        : $scope.formData.user,
                password    : base64.encode($scope.formData.password),
                url         : $scope.formData.url,
                port        : $scope.formData.port,
                cluster_info: {},
                insecure    : 'true',
                extensions  : {}
            };

            const config = await genericReq.request('GET', '/api/wazuh-api/configuration', {});
            appState.setPatternSelector(typeof config.data.data['ip.selector'] !== 'undefined' ? config.data.data['ip.selector'] : true)
            if(config.data && config.data.data) {
                tmpData.extensions.audit = typeof config.data.data['extensions.audit'] !== 'undefined' ? config.data.data['extensions.audit'] : true;
                tmpData.extensions.pci = typeof config.data.data['extensions.pci'] !== 'undefined' ? config.data.data['extensions.pci'] : true;
                tmpData.extensions.gdpr = typeof config.data.data['extensions.gdpr'] !== 'undefined' ? config.data.data['extensions.gdpr'] : true;
                tmpData.extensions.oscap = typeof config.data.data['extensions.oscap'] !== 'undefined' ? config.data.data['extensions.oscap'] : true;
                tmpData.extensions.ciscat = typeof config.data.data['extensions.ciscat'] !== 'undefined' ? config.data.data['extensions.ciscat'] : false;
                tmpData.extensions.aws = typeof config.data.data['extensions.aws'] !== 'undefined' ? config.data.data['extensions.aws'] : false;
                tmpData.extensions.virustotal = typeof config.data.data['extensions.virustotal'] !== 'undefined' ? config.data.data['extensions.virustotal'] : false;
            }

            const checkData = await testAPI.check(tmpData)

            // API Check correct. Get Cluster info
            tmpData.cluster_info = checkData.data;

            // Insert new API entry
            const data = await genericReq.request('PUT', '/api/wazuh-api/settings', tmpData);
            appState.setExtensions(data.data.response._id,tmpData.extensions)
            const newEntry = {
                _id: data.data.response._id,
                _source: {
                    cluster_info: tmpData.cluster_info,
                    active      : tmpData.active,
                    url         : tmpData.url,
                    api_user    : tmpData.user,
                    api_port    : tmpData.port,
                    extensions  : tmpData.extensions
                }
            };
            $scope.apiEntries.push(newEntry);
            $scope.apiEntries = $scope.apiEntries.sort(sortByTimestamp);

            errorHandler.info('Wazuh API successfully added','Settings');
            $scope.addManagerContainer = false;

            $scope.formData = {}

            // Setting current API as default if no one is in the cookies
            if (!appState.getCurrentAPI()) { // No cookie
                if ($scope.apiEntries[$scope.apiEntries.length - 1]._source.cluster_info.status === 'disabled') {
                    appState.setCurrentAPI(JSON.stringify({name: $scope.apiEntries[$scope.apiEntries.length - 1]._source.cluster_info.manager, id: $scope.apiEntries[$scope.apiEntries.length - 1]._id }));
                } else {
                    appState.setCurrentAPI(JSON.stringify({name: $scope.apiEntries[$scope.apiEntries.length - 1]._source.cluster_info.cluster, id: $scope.apiEntries[$scope.apiEntries.length - 1]._id }));
                }
                $scope.$emit('updateAPI', {});
                $scope.currentDefault = JSON.parse(appState.getCurrentAPI()).id;
            }

            try {
                await genericReq.request('GET', '/api/wazuh-api/fetchAgents');            
            } catch (error) {

                if(error && error.status && error.status === -1) {
                    errorHandler.handle('Wazuh API was inserted correctly, but something happened while fetching agents data.','Fetch agents',true);
                } else {
                    errorHandler.handle(error,'Fetch agents');
                }
                
            }

            await getSettings();

            if(!$scope.$$phase) $scope.$digest();
            return;

        } catch(error) {
            if(error.status === 400){
                error.message = 'Please, fill all the fields in order to connect with Wazuh RESTful API.'
            }
            printError(error);
        }
    };

    $scope.isUpdating = () => {
        for(let key in $scope.showEditForm){
            if($scope.showEditForm[key]) return true;
        }
        return false;
    };

    // Update settings function
    $scope.updateSettings = async item => {
        try {
            $scope.messageErrorUpdate = '';

            const invalid = validator('formUpdate');
            if(invalid) {
                $scope.messageErrorUpdate = invalid;
                errorHandler.handle(invalid,'Settings');
                return;
            }

            const index = $scope.apiEntries.indexOf(item);

            const tmpData = {
                user:         $scope.formUpdate.user,
                password:     base64.encode($scope.formUpdate.password),
                url:          $scope.formUpdate.url,
                port:         $scope.formUpdate.port,
                cluster_info: {},
                insecure:     'true',
                id:           $scope.apiEntries[index]._id,
                extensions:   $scope.apiEntries[index]._source.extensions
            };

            const data = await testAPI.check(tmpData);
            tmpData.cluster_info = data.data;
            await genericReq.request('PUT', '/api/wazuh-api/update-settings' , tmpData);
            $scope.apiEntries[index]._source.cluster_info = tmpData.cluster_info;

            wzMisc.setApiIsDown(false)
            $scope.apiIsDown = false;

            $scope.apiEntries[index]._source.cluster_info.cluster = tmpData.cluster_info.cluster;
            $scope.apiEntries[index]._source.cluster_info.manager = tmpData.cluster_info.manager;
            $scope.apiEntries[index]._source.url                  = tmpData.url;
            $scope.apiEntries[index]._source.api_port             = tmpData.port;
            $scope.apiEntries[index]._source.api_user             = tmpData.user;

            $scope.apiEntries = $scope.apiEntries.sort(sortByTimestamp);
            $scope.showEditForm[$scope.apiEntries[index]._id] = false;

            errorHandler.info('Connection success','Settings');

            if(!$scope.$$phase) $scope.$digest();
            return;
        } catch (error) {
            printError(error,true);
        }
    };

    $scope.switch = () => $scope.addManagerContainer = !$scope.addManagerContainer;

    // Check manager connectivity
    $scope.checkManager = async item => {
        try {
            const index = $scope.apiEntries.indexOf(item);

            const tmpData = {
                user        : $scope.apiEntries[index]._source.api_user,
                //password    : $scope.apiEntries[index]._source.api_password,
                url         : $scope.apiEntries[index]._source.url,
                port        : $scope.apiEntries[index]._source.api_port,
                cluster_info: {},
                insecure    : 'true',
                id          : $scope.apiEntries[index]._id
            };

            const data = await testAPI.check(tmpData);
            tmpData.cluster_info = data.data;

            const tmpUrl = `/api/wazuh-api/updateApiHostname/${$scope.apiEntries[index]._id}`;
            await genericReq.request('PUT', tmpUrl , { cluster_info: tmpData.cluster_info });

            $scope.apiEntries[index]._source.cluster_info = tmpData.cluster_info;
            wzMisc.setApiIsDown(false)
            $scope.apiIsDown = false;
            errorHandler.info('Connection success','Settings');

            if(!$scope.$$phase) $scope.$digest();
            return;
        } catch(error) {
            printError(error);
        }
    };

    // Toggle extension
    $scope.toggleExtension = (extension, state) => {
        try{
            const api = JSON.parse(appState.getCurrentAPI()).id
            const currentExtensions = appState.getExtensions(api);
            currentExtensions[extension] = state;
            appState.setExtensions(api,currentExtensions)
            getCurrentAPIIndex()
            $scope.apiEntries[currentApiEntryIndex]._source.extensions = currentExtensions;
            if(!$scope.$$phase) $scope.$digest();
        } catch (error) {
            errorHandler.handle(error, 'Settings')
        }
    };

    $scope.changeIndexPattern = async newIndexPattern => {
        try {
            appState.setCurrentPattern(newIndexPattern);
            await genericReq.request('GET',`/refresh-fields/${newIndexPattern}`,{})
            $scope.$emit('updatePattern', {});
            errorHandler.info('Successfully changed the default index-pattern','Settings');
            $scope.selectedIndexPattern = newIndexPattern;
            if(!$scope.$$phase) $scope.$digest();
            return;
        } catch (error) {
            errorHandler.handle('Error while changing the default index-pattern','Settings');
        }
        return;
    };

    const printError = (error,updating) => {
        const text = errorHandler.handle(error,'Settings');
        if(!updating) $scope.messageError       = text;
        else          $scope.messageErrorUpdate = text;
    };

    const getAppInfo = async () => {
        try {
            const data = await genericReq.request('GET', '/api/wazuh-elastic/setup');
            $scope.appInfo = {};
            $scope.appInfo["app-version"]      = data.data.data["app-version"];
            $scope.appInfo["installationDate"] = data.data.data["installationDate"];
            $scope.appInfo["revision"]         = data.data.data["revision"];
            $scope.load = false;
            const config = await genericReq.request('GET', '/api/wazuh-api/configuration', {});
            appState.setPatternSelector(typeof config.data.data['ip.selector'] !== 'undefined' ? config.data.data['ip.selector'] : true)
            if (appState.getCurrentPattern() !== undefined && appState.getCurrentPattern() !== null) { // There's a pattern in the cookies
                $scope.selectedIndexPattern = appState.getCurrentPattern();
            } else { // There's no pattern in the cookies, pick the one in the settings
               $scope.selectedIndexPattern = config.data.data["pattern"];
            }

            if(config.data && config.data.data && !appState.getCurrentAPI()) {
                $scope.extensions = {};
                $scope.extensions.audit = typeof config.data.data['extensions.audit'] !== 'undefined' ? config.data.data['extensions.audit'] : true;
                $scope.extensions.pci = typeof config.data.data['extensions.pci'] !== 'undefined' ? config.data.data['extensions.pci'] : true;
                $scope.extensions.gdpr = typeof config.data.data['extensions.gdpr'] !== 'undefined' ? config.data.data['extensions.gdpr'] : true;
                $scope.extensions.oscap = typeof config.data.data['extensions.oscap'] !== 'undefined' ? config.data.data['extensions.oscap'] : true;
                $scope.extensions.ciscat = typeof config.data.data['extensions.ciscat'] !== 'undefined' ? config.data.data['extensions.ciscat'] : false;
                $scope.extensions.aws = typeof config.data.data['extensions.aws'] !== 'undefined' ? config.data.data['extensions.aws'] : false;
                $scope.extensions.virustotal = typeof config.data.data['extensions.virustotal'] !== 'undefined' ? config.data.data['extensions.virustotal'] : false;
            } else {
                $scope.extensions = appState.getExtensions(JSON.parse(appState.getCurrentAPI()).id);
            }
            if(!$scope.$$phase) $scope.$digest();
            return;
        } catch (error) {
            errorHandler.handle('Error when loading Wazuh setup info','Settings');
        }
        return;
    };

    // Loading data
    getSettings().then(getAppInfo);
});
