const Q = require('q');
if (process.env.NODE_ENV !== "production") {
    const dotEnv = require("dotenv"); //Configure environmental variables
    const result = dotEnv.config();

    if (result.error) {
        throw result.error;
    }
}
const appBootstrap = require("../main");
const commons = require("../helper/commons");
const usersService = require("../services/users");
const membersService = require("../services/members");
const moment = require("moment");

const token = process.env.SLACK_ACCESS_TOKEN;

const {RTMClient, WebClient, ErrorCode} = require("@slack/client");
const rtm = new RTMClient(token);
const web = new WebClient(token);
let rtmDeferred = Q.defer();

function startRtm() {
    rtm.start().then(success => {
        console.log("Connection successful!");
        rtmDeferred.resolve(success)
    }).catch(error => {
        if (error.code === ErrorCode.PlatformError) {
            console.log(error.message);
            console.log(error.data);
        }
        rtmDeferred.reject(error);
    });
}

startRtm();

let today = moment().format("YYYY-MM-DD");

let service = {};
service.sendMessageToUser = sendMessageToUser;
service.postMessageToUser = postMessageToUser;
service.saveStandUp = saveStandUp;
service.promptIndividualStandup = promptIndividualStandup;
service.notifyBeforePostingStandup = notifyBeforePostingStandup;
service.postTeamStandupsToChannel = postTeamStandUpsToChannel;
service.postIndividualStandupToChannel = postIndividualStandUpToChannel;
service.refreshChannelMembers = refreshChannelMembers;
service.respondToMessages = respondToMessages;
service.openDialog = openDialog;
service.getDialog = getDialog;
service.startRtm = startRtm;
service.updateStandUp = updateStandUp;
module.exports = service;

/**
 * @desc Gets the dialog
 */
function getDialog() {
    let deferred = Q.defer();
    deferred.resolve("Cool! Everything works for dialog! Congratulations!!");
    return deferred.promise;
}


/***
 * Sends message to user with the specified Id
 * @param userId slack user id
 * @param message message to be sent
 * @returns {Q.Promise<any>}
 */
function sendMessageToUser(userId, message) {
    let deferred = Q.defer();
    web.conversations
        .list({exclude_archived: true, types: "im"})
        .then(response => {
            const foundUser = response.channels.find(u => u.user === userId);
            if (foundUser) {
                rtm.sendMessage(message, foundUser.id)
                    .then(success => {
                        deferred.resolve(`Message sent to user ${foundUser.user} with ts:${success.ts}`);
                    }).catch(error => {
                    deferred.reject(error);
                });
            } else {
                deferred.reject("User doesnt exist or is the bot user!");
            }
        });

    return deferred.promise;
}

/***
 * Posts message to user with the specified id
 * @param userId users slack id
 * @param message message to be posted
 * @param attachments formatted text to improve visual appearance on slack
 * @returns {Q.Promise<any>}
 */
function postMessageToUser(userId, message, attachments) {
    let deferred = Q.defer();
    web.conversations
        .list({exclude_archived: true, types: "im"})
        .then(response => {
            const foundUser = response.channels.find(u => u.user === userId);
            if (foundUser) {
                web.chat
                    .postMessage({
                        text: message,
                        attachments: attachments,
                        channel: foundUser.id
                    })
                    .then(success => {
                        deferred.resolve(`Message sent user channel ${userId} with ts:${success.ts}`);
                    })
                    .catch(error => {
                        if (error.code === ErrorCode.PlatformError) {
                            console.log(error.message);
                            console.log(error.data);
                        }
                        deferred.reject(error)
                    });

            } else {
                deferred.reject("This bot does not belong to any channel, invite it to at least one and try again");
            }
        });

    return deferred.promise;
}

/***
 * Saves stand-ups to db
 */
function saveStandUp(standUpDetails) {
    appBootstrap.userStandupRepo.add(standUpDetails);
}

/**
 * @desc Update the latest stand up
 * @param standUpDetails
 */
function updateStandUp(standUpDetails) {
    appBootstrap.userStandupRepo.update(standUpDetails);
}


/***
 * prompt for standup from those who have not submitted
 * @param promptMessage random message sent to users
 */
function promptStandup(promptMessage) {
    usersService.getLateSubmitters().then(lateSubmitters => {
        if (lateSubmitters.length > 0) {
            console.log("Behold late submitters members = > " + lateSubmitters);
            lateSubmitters.forEach(user => {
                sendMessageToUser(user, promptMessage);
            });
        }
    });
}

function promptIndividualStandup() {
    promptStandup(commons.pickRandomPromptMsg());
}

/**
 * Notify users 180 minutes before posting standup on channel
 */
function notifyBeforePostingStandup() {
    promptStandup(commons.pickRandomReminderMsg());
}

/**
 * Method that posts message to standup channel
 * @param message
 * @param allAttachments
 */
function postMessageToChannel(message, allAttachments) {
    web.channels.list().then(res => {
        const channel = res.channels.find(c => c.is_member);
        if (channel) {
            web.chat
                .postMessage({
                    text: message,
                    attachments: allAttachments,
                    channel: channel.id
                })
                .then(msg =>
                    console.log(
                        `Message sent to channel ${channel.name} with ts:${msg.ts}`
                    )
                )
                .catch(console.error);
        } else {
            console.log(
                "This bot does not belong to any channel, invite it to at least one and try again"
            );
        }
    });
}

/**
 * Formats the message by applying slack formatting for better visuals
 * @param item  current posted standup
 * @param index current index or position of standup update
 * @param data all posted standups
 * @returns {{color: string, footer: string, title: string, fields: {short: boolean, title: string, value: string}[], fallback: string}}
 */
function formatTeamsMessageAttachment(item, index, data) {
    let attachment = {
        color: "#dfdfdf",
        title: `<@${item.username}>`,
        fallback:
            "Sorry Could not display standups in this type of device. Check in desktop browser",
        fields: [
            {
                title: "Today",
                value: `${item.standup_today}`,
                short: false
            }
        ],
        footer: `Posted as ${item.team}`
    };
    if (item.standup_previous != null) {
        const previously = {
            title: "Yesterday/Previously",
            value: `${
                item.standup_previous == null
                    ? "Not specified"
                    : item.standup_previous
                }`,
            short: false
        };
        attachment.fields.push(previously);
    }
    if (item.blockers != null) {
        const blockers = {
            title: "Blockers",
            value: `${item.blockers == null ? "Not specified" : item.blockers}`,
            short: false
        };
        attachment.fields.push(blockers);
    }

    if (index === 0) {
        attachment.pretext = `Team ${item.team} Standups`;
        attachment.color = "#7DCC34";
    }
    if (index > 0) {
        if (item.team !== data[index - 1].team) {
            attachment.pretext = `Team ${item.team} Standups`;
            attachment.color = "#7DCC34";
        }
    }
    return attachment;
}

/***
 *  Post formatted standups to channel
 */
function postTeamStandUpsToChannel() {
    today = moment().format("YYYY-MM-DD");
    let todayFormatted = moment(today, "YYYY-MM-DD").format("MMM Do YYYY");
    let standupUpdate = `*📅 Showing Ona Standup Updates On ${todayFormatted}*\n\n`;
    appBootstrap.userStandupRepo.getByDatePosted(today)
        .then(data => {
            let attachments = [];
            data.forEach((item, index) => {
                let attachment = formatTeamsMessageAttachment(item, index, data);
                attachments.push(attachment);
            });
            return Promise.resolve(attachments);
        })
        .then(allAttachments => {
            if (allAttachments.length > 0) {
                postMessageToChannel(standupUpdate, allAttachments);
            } else {
                standupUpdate = `*📅 Nothing to show. No standup updates for ${todayFormatted}*`;
                postMessageToChannel(standupUpdate, [])
            }
        });
}

/**
 * Formats the message for a single standup posted by user
 * @param item standup to be posted
 * @returns {{color: string, footer: string, title: string, fields: {short: boolean, title: string, value: string}[], fallback: string}}
 */
function formatSingleMessageAttachment(item) {
    let attachment = {
        color: "#FFA300",
        title: `<@${item.username}>`,
        fallback:
            "Sorry Could not display standups in this type of device. Check in desktop browser",
        fields: [
            {
                title: "Today",
                value: `${item.standup_today}`,
                short: false
            }
        ],
        footer: `Posted as individual`
    };
    if (item.standup_previous !== null) {
        const previously = {
            title: "Yesterday/Previously",
            value: `${
                item.standup_previous == null
                    ? "Not specified"
                    : item.standup_previous
                }`,
            short: false
        };
        attachment.fields.push(previously);
    }
    if (item.blockers != null) {
        const blockers = {
            title: "Blockers",
            value: `${item.blockers == null ? "Not specified" : item.blockers}`,
            short: false
        };
        attachment.fields.push(blockers);
    }
    return attachment;
}

/**
 * Posts individual standup to channel
 * @param item standup to be posted
 * @returns {Q.Promise<any>}
 */
function postIndividualStandUpToChannel(item) {
    let deferred = Q.defer();
    let todayFormatted = moment(item.date_posted, "YYYY-MM-DD").format("MMM Do YYYY");
    let standupUpdate = `🔔*New standup update posted ${todayFormatted}*\n\n`;
    let attachment = formatSingleMessageAttachment(item);
    let attachments = [];
    attachments.push(attachment);
    postMessageToChannel(standupUpdate, attachments);
    return deferred.promise;
}

/**
 * Interact with users v
 */
function respondToMessages() {
}

/***
 *
 * @param triggerId trigger_id sent by invoking slash command
 * @param dialog content of dialog to be opened
 * @returns {Q.Promise<any>}
 */
function openDialog(triggerId, dialog) {
    let deferred = Q.defer();
    web.dialog.open({trigger_id: triggerId, dialog: JSON.stringify(dialog)})
        .then(success => {
            console.log("Open dialog res: %o ", success);
            deferred.resolve(success);
        })
        .catch(error => {
            if (error.code === ErrorCode.PlatformError) {
                console.log(error.message);
                console.log(error.data);
            }
            deferred.reject(error);
        });

    return deferred.promise;
}

/**
 * Flush channel members table
 * Find channel that the bot belongs to, get the members and save to local db
 */
function refreshChannelMembers() {
    membersService.flushMembers();
    let deferred = Q.defer();
    const resp = {};
    web.channels.list().then(success => {
        const channel = success.channels.find(c => c.is_member);
        if (channel) {
            resp.ok = true;
            resp.members = channel.members;
        } else {
            resp.ok = false;
            resp.members = [];
        }
        console.log("channel members " + resp.members);
        resp.members.map(it => {
            membersService.saveMember(it)
        });
        deferred.resolve(resp.members);
    }).catch(error => {
        if (error.code === ErrorCode.PlatformError) {
            console.log(error.message);
            console.log(error.data);
        }
        deferred.reject(error);
    });

    return deferred.promise
}
