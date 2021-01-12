// Launches an EC2 Instance & attaches a cloud-init script to backup an entire RDS cluster using the credentials supplied in the tag.
// Author: David Nedved.
// ------------------------------------------------------------------------------------------------------------

var awsSSHKeyName = process.env.EC2_KEYPAIR_NAME
var iamRole = process.env.EC2_WORKER_ROLE
var ec2WorkerSize = process.env.EC2_WORKER_SIZE
var s3BucketName = process.env.S3_BUCKET

var amazonLinux = require('../_shared/amazon-linux');

var fs = require('fs');

function describeNetworking(callback) {
    var params = {
      CacheSubnetGroupName: 'STRING_VALUE',
      Marker: 'STRING_VALUE',
      MaxRecords: 'NUMBER_VALUE'
    };
    elasticache.describeCacheSubnetGroups(params, function(err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else     console.log(data);           // successful response
    });

}

module.exports = {
    dump: function(node, region, callback) {

        console.dir(node);

        describeNetworking(function(response) {

        })


    //     var config = {
    //         VPC: instanceObject.DBSubnetGroup.VpcId,
    //         SecurityGroups: [],
    //         RDSEndpoint: instanceObject.Endpoint.Address,
    //         RDSPort: instanceObject.Endpoint.Port,
    //         AllocatedStorage: instanceObject.AllocatedStorage,
    //         region: region,

    //         // Just use the first subnet in the object... (since we're only going to launch one EC2 Instance...)
    //         Subnet: instanceObject.DBSubnetGroup.Subnets[0].SubnetIdentifier,
    //         SubnetAvailabilityZone: instanceObject.DBSubnetGroup.Subnets[0].SubnetAvailabilityZone.Name,
    //         ImageId: null,
    //         launchScript: null
    //     }

    //     // Push SG ID's into Array...
    //     instanceObject.VpcSecurityGroups.forEach(function(sg) {
    //         config.SecurityGroups.push(sg.VpcSecurityGroupId);
    //     });

    //     // Read cloud-init file into memory...
    //     var contents = fs.readFileSync(__dirname + '/cloud-init/engine-postgresql.yaml', 'utf8');

    //     // There's several variables in our cloud-init file that we will need to replace
    //     contents = contents.replace('%%PG_HOST%%', config.RDSEndpoint);
    //     contents = contents.replace('%%PG_PORT%%', config.RDSPort);
    //     contents = contents.replace('%%S3_BUCKET%%', s3BucketName);
    //     contents = contents.replace('%%RDS_REGION%%', region);

    //     // Add the username/password for the database also...
    //     contents = contents.replace('%%PG_USERNAME%%', backupConfigObject.Username);
    //     contents = contents.replace('%%PG_PASSWORD%%', backupConfigObject.Password);

    //     // User data must be base64 encoded to launch via AWS API...
    //     config.launchScript = Buffer.from(contents).toString('base64');

    //     // Launch instance to dump the data and upload to s3 based on Amazon Linux...
    //     amazonLinux.getAmazonLinuxID(region, function(response) {

    //         if(response) {
    //             config.ImageId = response.ImageId
    //             launchBackupInstance(config, function(response) {
    //                callback(response);
    //             })
    //         }
    //     });
    // }
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
        BlockDeviceMappings: [
            {
                DeviceName: "/dev/xvdc", 
                Ebs: {
                    VolumeSize: config.AllocatedStorage, // Additional Block Device Storage should match the DB instance provisioned storage (This way if we're dumping a 50gb database we'll have 50gb of storage, 200gb database we'll have 200gb of storage etc...)
                    DeleteOnTermination: true
                }
            }
        ],
        SecurityGroupIds: config.SecurityGroups, // Same security group's as the Database Instance Ideally.
        SubnetId: config.Subnet,
        UserData: config.launchScript,
        IamInstanceProfile: {
            Name: iamRole
        }
    };

    // Create a promise on an EC2 service object
    var instancePromise = new AWS.EC2({apiVersion: '2016-11-15'}).runInstances(instanceParams).promise();

    // Handle promise's fulfilled/rejected states
    instancePromise.then(
        function(data) {            
            var instanceId = data.Instances[0].InstanceId;

            // Add tags to the instance
            tagParams = { Resources: [instanceId], Tags: [
                    {
                       Key: 'Name',
                       Value: 'Automated DB Dump for: ' + config.RDSEndpoint
                    }
                ]
            };

            // Create a promise on an EC2 service object
            var tagPromise = new AWS.EC2({apiVersion: '2016-11-15'}).createTags(tagParams).promise();
        
            // Handle promise's fulfilled/rejected states
            tagPromise.then(
                function(data) {
                    console.log("+ Backup Worker Instance Launched in: " + config.region);
                }
            ).catch(
                function(err) {
                    console.error(err, err.stack);
                }
            );
        }
    ).catch(
        function(err) {
            console.error(err, err.stack);
        }
    );
}

