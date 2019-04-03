// Iterate through all AWS regions and copy tags from EC2 Instances to EBS Volumes
// Author: David Nedved.
// ------------------------------------------------------------------------------------------------------------

var awsRegions = require('aws-regions');
// This is a bit stupid - AWS should be copying the tags from EC2 Instances to EBS volumes by now - we're not in 2006 anymore....

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
    var ec2 = new AWS.EC2();


    var getInstanceParams = {
        DryRun: false
    };

    ec2.describeInstances(getInstanceParams, function(err, data) {
        for (var i in data.Reservations) {
            var instance = data.Reservations[i].Instances[0]

            // Get any attached volumes (and copy tags from the instance to these volumes)...
            instance.BlockDeviceMappings.forEach(function(volume) {
                copyTagsToVolumes(instance.Tags, volume);
            });
        }
    });

    function copyTagsToVolumes(InstanceTags, BlockDeviceMapping) {

        function startsWith(str, word) {
            return str.lastIndexOf(word, 0) === 0;
        }

        var params = {
            Resources: [
                BlockDeviceMapping.Ebs.VolumeId
            ],
            Tags: [
                {
                    Key: "VolumeMapping",
                    Value: BlockDeviceMapping.DeviceName
                }
            ]
        };

        // Push in EC2 Instance Tags to our EBS Volume Tags...
        InstanceTags.forEach(function(tag) {

            // Tag keys starting with \'aws:\' are reserved for internal AWS API USE
            if(!startsWith(tag.Key, "aws:")) {
                params.Tags.push({
                    Key: tag.Key,
                    Value: tag.Value
                })
            }
        });

        ec2.createTags(params, function(err, data) {
            if (err) console.log(err, err.stack); // an error occurred
        });
    }
}