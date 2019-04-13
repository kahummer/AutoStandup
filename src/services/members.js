const Q = require('q');
if (process.env.NODE_ENV !== "production") {
    const dotEnv = require("dotenv"); //Configure environmental variables
    const result = dotEnv.config();

    if (result.error) {
        throw result.error;
    }
}

const appBootstrap = require("../services/repos");

module.exports = {
    saveMember: saveMember,
    flushMembers: flushMembers
};

/**
 * get all users who unsubscribed
 */
function getMembers() {
    let deferred = Q.defer();
    appBootstrap.memberRepository.getAllChannelMembers()
        .then(response => {
            deferred.resolve(response);
        })
        .catch(error => {
            if (error.code === ErrorCode.PlatformError) {
                console.log("error message", error.message);
                console.log("error message", error.data);
            }
            deferred.reject(error);
        });

    return deferred.promise
}


function saveMember(username) {
    appBootstrap.memberRepository.addMember(username);
}

function flushMembers() {
    appBootstrap.memberRepository.countMembers().then(membersCount => {
        if (membersCount.value > 0) {
            appBootstrap.memberRepository.flushMembers();
        }
    });
}

