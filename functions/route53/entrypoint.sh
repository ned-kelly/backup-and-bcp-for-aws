#!/bin/bash
#
# Pull in pre-compiled cli53 golang binary (statically linked - This runs fine within Lambda)...
# You may modify the following if you should chose to bundle the binary into this serverless function (rather then downloading on the fly) 

if [ ! -f /tmp/cli53 ]; then
    if [[ "$OSTYPE" == "linux-gnu" ]]; then

        # CURL no longer included in node 10 and 12x on AWS Lambda...
        CLI53_BIN="https://github.com/barnybug/cli53/releases/download/0.8.17/cli53-linux-amd64"
        node -e 'const http = require("follow-redirects").https, fs = require("fs"); const file = fs.createWriteStream("/tmp/cli53"); const request = http.get("'$CLI53_BIN'", function(response) { response.pipe(file); });'

    elif [[ "$OSTYPE" == "darwin"* ]]; then

        # CURL no longer included in node 10 and 12x on AWS Lambda...
        CLI53_BIN="https://github.com/barnybug/cli53/releases/download/0.8.17/cli53-mac-amd64"
        node -e 'const http = require("follow-redirects").https, fs = require("fs"); const file = fs.createWriteStream("/tmp/cli53"); const request = http.get("'$CLI53_BIN'", function(response) { response.pipe(file); });'
    fi
fi

chmod +x /tmp/cli53

# Declare backup path & master zone files
BACKUP_PATH="/tmp/route53/$(date +%F_%H-%M-%S)"
ZONES_FILE="/tmp/all-zones.txt"
DNS_FILE="/tmp/all-dns.txt"

# Create date-stamped backup directory and enter it
mkdir -p "$BACKUP_PATH"
cd "$BACKUP_PATH"

# Create a list of all hosted zones
echo "Generating list of Zones to backup..."
/tmp/cli53 list --format text > "$ZONES_FILE" 2>&1

# Create a list of domain names only
sed '/Name:/!d' "$ZONES_FILE" | cut -d: -f2 | sed 's/^..//' | sed 's/.\{3\}$//' > "$DNS_FILE"

# Create backup files for each domain
while read -r line; do
    echo "Generating: $line.zone"
    /tmp/cli53 export --full "$line" > "$line.zone"
done < "$DNS_FILE"

if [ -z "$(ls -A $BACKUP_PATH)" ]; then
   echo "No zone files were backed up. If this is in error, check you have the correct permissions to your Route53 Zone Files."
else
   echo "Route53 Zone Files Written."
fi

exit 0