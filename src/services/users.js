const Q = require('q');
if (process.env.NODE_ENV !== "production") {
    const dotEnv = require("dotenv"); //Configure environmental variables
    const result = dotEnv.config();

    if (result.error) {
        throw result.error;
    }
}

const appBootstrap = require("../main");
const moment = require("moment");
let today = moment().format("YYYY-MM-DD");

let service = {};
service.getUsers = getUsers;
service.checkUser = checkUser;
service.saveUser = saveUser;
service.deleteUser = deleteUser;
service.getLateSubmitters = getLateSubmitters;
service.getChannelMembers = getStoredChannelMembers;
service.getHistory = getHistory;
service.getTodayPostedStandup = getTodayPostedStandup;
module.exports = service;

/**
 * get all users who unsubscribed
 */
function getUsers() {
    let deferred = Q.defer();
    appBootstrap.userRepo.getAllUsers()
        .then(response => {
            deferred.resolve(response);
        })
        .catch(error => {
            deferred.reject(error);
        });

    return deferred.promise
}

function checkUser(username) {
    let deferred = Q.defer();
    appBootstrap.userRepo.getByUsername(username)
        .then(success => {
            deferred.resolve(success);
        })
        .catch(error => {
            deferred.reject(error);
        });

    return deferred.promise;
}

function saveUser(username) {
    appBootstrap.userRepo.add(username);
}

function deleteUser(username) {
    appBootstrap.userRepo.deleteByUsername(username);
}

/**
 * Retrieve all the locally stored channel members
 */
function getStoredChannelMembers() {
    let deferred = Q.defer();
    appBootstrap.memberRepository.getAllChannelMembers().then(success => {
        deferred.resolve(success.map(it => it.username));
    }).catch(error => {
        deferred.reject(error);
    });
    return deferred.promise
}

/**
 * Get those who have submitted. If someone is not in this list then
 * they have not submitted.
 */
function getLateSubmitters() {
    let deferred = Q.defer();
    today = moment().format("YYYY-MM-DD");

    getUsers().then(unsubscribedUsers => {
        let users = unsubscribedUsers.map(it => it.username);
        let earlySubmitter = [];
        appBootstrap.userStandupRepo.getUsersWhoSubmittedByDate(today)
            .then(submitters => {
                earlySubmitter = submitters.map(it => it.username);
                return getStoredChannelMembers().then(members => {
                    console.log("All channel members = > " + members);
                    console.log("Unsubscribed members = > " + users);
                    console.log("Submitted members = > " + earlySubmitter);
                    //Remove those who submitted from this list
                    let filteredChannelUsers = members.filter(item => !earlySubmitter.includes(item));
                    //Remove users who have unsubscribed and return the list
                    filteredChannelUsers = filteredChannelUsers.filter(item => !users.includes(item));
                    deferred.resolve(filteredChannelUsers);
                })
            })
            .catch(error => {
                deferred.reject(error);
            });
    });

    return deferred.promise;
}

function getHistory(username, daysToSubtract) {
    let deferred = Q.defer();
    let momentStartDate = moment().subtract(daysToSubtract, 'days').calendar();
    let startDate = moment(momentStartDate, "L").format("YYYY-MM-DD");
    today = moment().format("YYYY-MM-DD");
    appBootstrap.userStandupRepo.getHistory(username, startDate, today)
        .then((success) => {
            deferred.resolve(success);
        })
        .catch(error => {
            deferred.reject(error);
        });

    return deferred.promise;
}

function getTodayPostedStandup(username) {
    let deferred = Q.defer();
    let today = moment().format("YYYY-MM-DD");
    appBootstrap.userStandupRepo.getByUserAndDate(username, today).then((success) => {
        deferred.resolve(success);
    }).catch((error) => {
        deferred.reject(error);
    });

    return deferred.promise;
}
