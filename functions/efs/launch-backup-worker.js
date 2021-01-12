// Launches an EC2 Instance in the same AS as an EFS mount point, attaches a cloud-init script to backup a the data in the EFS to S3.
// Author: David Nedved.
// ------------------------------------------------------------------------------------------------------------

var awsSSHKeyName = process.env.EC2_KEYPAIR_NAME;
var iamRole = process.env.EC2_WORKER_ROLE;
var ec2WorkerSize = process.env.EC2_WORKER_SIZE;
var s3BucketName = process.env.S3_BUCKET;
var launchWithPublicIPs = process.env.TRY_PUBLIC_IPS || true;

var amazonLinux = require('../_shared/amazon-linux');

var fs = require('fs');

module.exports = {
    backupEFS: function(efsObject, region, callback) {

        var config = {
            region: region,
            SecurityGroups: [],
            ImageId: null,
            launchScript: null,
            fsId: efsObject.FileSystemId,
            fsName: efsObject.Name,
            Subnet: efsObject.MountTarget.SubnetId,
        }

        // Push SG ID's into Array...
        efsObject.MountTargetSecurityGroups.forEach(function(sg) {
            config.SecurityGroups.push(sg);
        });

        // Read cloud-init file into memory...
        var contents = fs.readFileSync(__dirname + '/cloud-init.yaml', 'utf8');

        // There's several variables in our cloud-init file that we will need to replace
        contents = contents.replace('%%EFS_ID%%', config.fsId);
        contents = contents.replace('%%EFS_NAME%%', config.fsName);
        contents = contents.replace('%%EFS_REGION%%', region);
        contents = contents.replace('%%S3_BUCKET%%', s3BucketName);

        // User data must be base64 encoded to launch via AWS API...
        config.launchScript = Buffer.from(contents).toString('base64');

        // Launch instance to dump the data and upload to s3 based on Amazon Linux...
        amazonLinux.getAmazonLinuxID(region, function(response) {

            if(response) {
                config.ImageId = response.ImageId
                launchBackupInstance(config, function(response) {
                   callback(response);
                })
            }
        });

    }
}

function launchBackupInstance(config, callback) {

    var AWS = require('aws-sdk');
    AWS.config.update({region: config.region});

    var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

    // We're using the vanilla Amazon Linux AMI here
    var instanceParams = {
        ImageId: config.ImageId,
        InstanceType: ec2WorkerSize,
        MinCount: 1,
        MaxCount: 1,
        KeyName: awsSSHKeyName,
        InstanceInitiatedShutdownBehavior: 'terminate', // When the scripts are finished and the instance shuts down AWS will just terminate this instance...
        UserData: config.launchScript,
        IamInstanceProfile: {
            Name: iamRole
        },
        TagSpecifications: [{
            ResourceType: "instance",
            Tags: [{
                Key: 'Name',
                Value: `Automated EFS Backup Worker for: ${config.fsId}`
            }]
        }],
    };

    // Try launch with Public IP address if variable set (otherwise assumes user has taken care of networking theirselves)...
    if(launchWithPublicIPs) {
        instanceParams.NetworkInterfaces = [];
        instanceParams.NetworkInterfaces.push({
            DeviceIndex: 0,
            SubnetId: config.Subnet,
            DeleteOnTermination: true,
            AssociatePublicIpAddress: true,
            Groups: config.SecurityGroups,
        })
    } else {
        instanceParams.SecurityGroupIds = config.SecurityGroups // Same security group's as the Database Instance Ideally.
        instanceParams.SubnetId = config.Subnet
    }

    // Create a promise on an EC2 service object
    var instancePromise = ec2.runInstances(instanceParams).promise();

}
