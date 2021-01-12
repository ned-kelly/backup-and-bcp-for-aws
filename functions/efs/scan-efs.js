// Iterate through all AWS regions and check for any provisioned EFS deployments that have a Backup Tag.
// Any EFS deployments in ANY region with a backup tag will then be dumped into S3 ...
// Author: David Nedved.
// ------------------------------------------------------------------------------------------------------------

var awsRegions = require('aws-regions');
var backupWorker = require('./launch-backup-worker');

module.exports.handler = function(event, context, callback) {

    var regions = awsRegions.list({ public: true });
    Object.keys(regions).forEach(function(key) {

        var region = regions[key];
        checkRegion(region.code)
    });
};

// Loop through each AWS region and copy tags away...
function checkRegion(region) {

    var AWS = require('aws-sdk');
    AWS.config.update({region: region});
    var efs = new AWS.EFS();

    var params = {};
    efs.describeFileSystems(params, function(err, data) {
        if (err) {

            // The EFS service is not available in every region currently.
            try {
                if(err.originalError.errno == 'ENOTFOUND') {
                    console.log("Skipping: " + region + ", EFS service is not provided here.");
                } else {
                    console.log(err, err.stack);
                }
            } catch(e) {}

        } else {
            //console.dir(data);
            for (var i in data.FileSystems) {
                var fs = data.FileSystems[i]
                getEFSTags(fs, efs, region)
            }
        }
    });
}

function getEFSTags(efsObject, efs, region) {
    var params = {
        FileSystemId: efsObject.FileSystemId
    };

    efs.describeTags(params, function(err, data) {
    if (err) console.log(err, err.stack);

        if(data.Tags && data.Tags.length) {

            for (var i in data.Tags) {
                var tag = data.Tags[i]
                if(tag.Key == "Backup") {
                    console.log("+ " + efsObject.FileSystemId + ", in " + region + " was tagged for backup.")
                    getEFSMountTargets(efsObject, efs, region)
                }
            }
        } // else - there's no tags specified specified on this rds instance...
    });
}

function getEFSMountTargets(efsObject, efs, region) {
    var params = {
        FileSystemId: efsObject.FileSystemId
    };

    efs.describeMountTargets(params, function(err, data) {
        if (err) console.log(err, err.stack);
        if(data.MountTargets && data.MountTargets.length) {

            // Push Mount Target into the data that we will send on to the 'backupWorker'.
            efsObject.MountTarget = data.MountTargets[0];

            // We also need to get the Security Groups associated with this EFS Mount Point (so we can launch the EC2 Instance in the same Subnet/SG's)
            var params = {
                MountTargetId: efsObject.MountTarget.MountTargetId
            };
            efs.describeMountTargetSecurityGroups(params, function(err, data) {
            if (err) console.log(err, err.stack);

                efsObject.MountTargetSecurityGroups = data.SecurityGroups;

                // Launch EFS Backup Worker Instance Instance...
                backupWorker.backupEFS(efsObject, region, function(response) {
                    console.dir(response);
                })

            });
        }
    });
}