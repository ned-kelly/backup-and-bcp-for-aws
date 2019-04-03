// This code has been adapted from Manoj's "ebs-snapshot-lambda" function designed to be deployed via Terraform.
// It falls under the Apache 2.0 License.
//
// Please see here for details: https://github.com/manojlds/ebs-snapshot-lambda
// ------------------------------------------------------------------------------------------------------------

var awsRegions = require('aws-regions');

var Promise = require('bluebird');
var utils = require('./utils');

var config = {
    "defaultRetention": process.env.SNAPSHOT_RETENTION || 30
}


var getPurgeDate = function(tags) {
    var purgeDate = new Date();
    purgeDate.setTime(purgeDate.getTime() + (tags['Retention'] || config.defaultRetention) * 86400000 );

    return utils.getDate(purgeDate);
};

var createSnapshot = function(volumeId, ec2) {
    var snapshotParams = {
        VolumeId: volumeId,
        DryRun: false
    };

    return ec2.createSnapshot(snapshotParams).promise();
};

var tagSnapshot = function(volume, snapshotId, ec2) {
    var tags = utils.getTags(volume.Tags);
    var purgeDate = getPurgeDate(tags);
    var additionalTags = [];

    // Copy tags to EBS Snapshot Volumes...
    additionalTags = volume.Tags.filter(function(tag) {
        return tag.Key !== "Retention" && tag.Key !== "Backup";
    })

    var snapshotTagParams = {
        Resources: [snapshotId],
        Tags: [
            {
                Key: 'VolumeId',
                Value: volume.VolumeId
            },
            {
                Key: 'PurgeDate',
                Value: purgeDate
            },
        ].concat(additionalTags),
        DryRun: false
    };
  
    return ec2.createTags(snapshotTagParams).promise();
}

var snapshotVolumes = function () {

    var regions = awsRegions.list({ public: true });
    Object.keys(regions).forEach(function(key) {

        var region = regions[key];
        var AWS = require('aws-sdk');
        var ec2 = new AWS.EC2({ region: region.code });

        var getVolumesParam = {
            DryRun: false,
            Filters: [
                {
                    Name: "tag-key",
                    Values: [
                        "Backup"
                    ]
                },
            ]
        };

        var snapshotPromises = ec2.describeVolumes(getVolumesParam)
            .promise()
            .then(function(data) {
                return data.Volumes.map(function(volume) {
                    return createSnapshot(volume.VolumeId, ec2)
                    .then(function(data) {
                        return tagSnapshot(volume, data.SnapshotId, ec2);
                    })
                });
            });

        return Promise.all(snapshotPromises);

    });
};

var deleteSnapshot = function(snapshotId, ec2) {
    var params = {
        SnapshotId: snapshotId,
        DryRun: false
    };
    return ec2.deleteSnapshot(params).promise();
};

var purgeSnapshots = function() {

    var regions = awsRegions.list({ public: true });
    Object.keys(regions).forEach(function(key) {

        var region = regions[key];
        var AWS = require('aws-sdk');
        var ec2 = new AWS.EC2({ region: region.code });

        var today = utils.getDate(new Date());
        var snapshotsParams = {
            DryRun: false,
            Filters: [
                {
                    Name: "tag:PurgeDate",
                    Values: [today]
                },
            ]
        };

        var snapshotDeletePromises = ec2.describeSnapshots(snapshotsParams).promise()
            .then(function(data) {
                return data.Snapshots.map(function(snapshot) {
                    return deleteSnapshot(snapshot.SnapshotId, ec2);
                });
            });

        return Promise.all(snapshotDeletePromises);
    });
};

exports.snapshotVolumes = snapshotVolumes;
exports.purgeSnapshots = purgeSnapshots;
