// Quick and dirty function to work which is the most recent Amazon Linux AMI that we should be launching (in a region provided)...

module.exports = {
    getAmazonLinuxID: function(region, callback) {

        var AWS = require('aws-sdk');
        AWS.config.update({region: region});

        var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
        var params = {
            // See here for filter reference: https://gist.github.com/nikolay/12f4ca2a592bbfa0df57c3bbccb92f0f
            // and: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeImages-property
            Filters: [
                {
                    Name: "owner-alias",
                    Values: [
                        "amazon"
                    ]
                },
                {
                    Name: "architecture",
                    Values: [
                        "x86_64"
                    ]
                },
                {
                    Name: "virtualization-type",
                    Values: [
                        "hvm"
                    ]
                },
                {
                    Name: "root-device-type",
                    Values: [
                        "ebs"
                    ]
                },
                {
                    Name: "state",
                    Values: [
                        "available"
                    ]
                },
                {
                    Name: "name",
                    Values: [
                        "amzn-ami-hvm-????.??.?.????????-x86_64-gp2"
                    ]
                }
            ]
        };

        ec2.describeImages(params, function(err, data) {
            if (err) console.log(err, err.stack); // an error occurred

            var latestImageDate = new Date(Math.max.apply(null, data.Images.map(function(e) {
                return new Date(e.CreationDate);
            })));


            data.Images.forEach(function(image) {

                // Compare using primitives date - not JS Date Object...
                var currentItem = new Date(image.CreationDate).getTime()

                // This is the most recent AMI version we can launch...
                if(latestImageDate.getTime() === currentItem) {
                    callback(image);
                }

            });
        });
    }
}
