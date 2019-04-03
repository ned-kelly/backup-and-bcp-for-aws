// Backups were originally using NodeJS to export route53 records, however the cli53 tool (https://github.com/barnybug/cli53)
// Has now been selected to backup/restore as DNS Zone files - this way the sysadmin may manually restore a file using the cli53 tool if they wish.

const AWS  = require('aws-sdk');
const fs   = require("fs");
const path = require("path");

var config = {
    s3BucketName: process.env.S3_BUCKET,
    s3folder: 'Route53',
    dnsZoneFiles: '/tmp/route53/'
};

module.exports.handler = function(event, context, callback) {
    const execFile = require('child_process').execFile;
    execFile('./functions/route53/entrypoint.sh', (error, stdout, stderr) => {
        if (error) {
            callback(error);
        }

        // Spit the bash output into the stdout so it goes into cloudwatch logs...
        console.log(stdout);

        const uploadDir = function(s3Path, bucketName) {

            let s3 = new AWS.S3();

            function walkSync(currentDirPath, callback) {
                fs.readdirSync(currentDirPath).forEach(function (name) {
                    var filePath = path.join(currentDirPath, name);
                    var stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        callback(filePath, stat);
                    } else if (stat.isDirectory()) {
                        walkSync(filePath, callback);
                    }
                });
            }

            walkSync(s3Path, function(filePath, stat) {
                let bucketPath = filePath.substring(s3Path.length+1);
                let params = {Bucket: bucketName, Key: config.s3folder + "/" + bucketPath, Body: fs.readFileSync(filePath) };
                
                s3.putObject(params, function(err, data) {
                    if (err) {
                        console.log(err)
                    } else {
                        console.log('Successfully uploaded '+ bucketPath +' to ' + bucketName);
                    }
                });

            });
        };

        // Upload files generated from shell script to S3 bucket.
        uploadDir(config.dnsZoneFiles, config.s3BucketName);
    });
};
