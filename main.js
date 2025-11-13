const fs = require("fs");
const path = require("path");
const axios = require("axios");
const https = require("https");
const cliProgress = require("cli-progress");

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const AGW_BASE_URL = "agw.eagle3dstreaming.com";

// Multi-bar for progress display
const multiBar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: '[{bar}] {percentage}% | {file} | {uploaded}/{total} MB'
}, cliProgress.Presets.shades_classic);

/**
 * Upload a streaming app to Eagle 3D Streaming
 * @param {string} fileLocation - Local file path to upload
 * @param {string} apiKey - Eagle3D API key
 * @param {string} appName - App name
 */
const uploadStreamingApp = async (fileLocation, apiKey, appName)  =>{
    if (!fs.existsSync(fileLocation)) {
        throw new Error(`File not found: ${fileLocation}`);
    }

    const fileSizeBytes = fs.statSync(fileLocation).size;
    const fileSizeMB = (fileSizeBytes / (1024 ** 2)).toFixed(2);
    const fileSizeGB = (fileSizeBytes / (1024 ** 3)).toFixed(2);

    console.log(`[Uploader] Preparing upload for ${appName} (${fileSizeMB} MB / ${fileSizeGB} GB)`);



    // Retry wrapper
    async function retry(fn, retries = 5, interval = 5000) {
        let lastError;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                console.warn(`[Uploader] Attempt ${attempt} failed: ${err.message}`);
                if (attempt < retries) await new Promise(res => setTimeout(res, interval));
            }
        }
        throw lastError;
    }

    // 1. Request signed URL
    const signedUrlData = await retry(async () => {
        const res = await axios.post(
            "https://" + AGW_BASE_URL + "/api/v3/us/streamingapp-uv-signed-url-with-times",
            { apiKey, appName, size: fileSizeGB },
            { httpsAgent }
        );
        if (!res.data?.data?.data?.url || res.data.data.status !== "success") {
            throw new Error("Failed to get signed URL");
        }
        return res.data.data.data;
    }, 10, 10000);

    const signedUrl = signedUrlData.url;
    const version = signedUrlData.filepath.split("/")[2].split(".")[0];
    console.log(`[Uploader] Got signed URL. Version: ${version}`);

    // 2. Upload file with progress
    await retry(async () => {
        const progressBar = multiBar.create(fileSizeMB, 0, { file: path.basename(fileLocation), uploaded: '0.00', total: fileSizeMB });

        const fileStream = fs.createReadStream(fileLocation);
        let uploadedBytes = 0;

        fileStream.on('data', chunk => {
            uploadedBytes += chunk.length;
            progressBar.update((uploadedBytes / (1024 ** 2)).toFixed(2), { uploaded: ((uploadedBytes / (1024 ** 2)).toFixed(2)) });
        });

        await axios.put(signedUrl, fileStream, {
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": fileSizeBytes
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            httpsAgent
        });

        progressBar.update(fileSizeMB, { uploaded: fileSizeMB });
        progressBar.stop();
    }, 10, 15000);

    multiBar.stop();

    console.log(`[Uploader] File upload complete.`);

    // 3. exe-info-upload
    const documentName = `${appName}_${version}`;
    const exeInfoPayload = {
        dbname: "appExeData",
        document: documentName,
        apiKey,
        isUnverified: "true",
        appname: appName,
        version,
        data: {
            dateTime: new Date().toISOString(),
            isDeleted: false,
            defaultExe: "default",
            appname: appName,
            version,
            exePaths: {
                "rplm.exe": "rplm.exe",
                "EL.exe": "EL.exe",
            },

            appSize: parseFloat(fileSizeGB),
            isLinuxBuild: false,
            buildType: "Windows_UE_Build_For_PS",
        },
        pluginInfo: { hasPlugin: false }
    };

    await retry(async () => {
        // console.log(exeInfoPayload)
        const res = await axios.post(
            // "https://" + AGW_BASE_URL + "/api/v3/upload-sequence/exe-info-upload",
            "https://agw.eagle3dstreaming.com/api/v3/st/stream-test",
            exeInfoPayload,
            { httpsAgent }
        );
        console.log(`[Uploader] stream-test invoke response: ${JSON.stringify(res.data)}`);
    }, 5, 5000);

    // 4. Poll stream test result
    console.log(`[Uploader] Polling stream test result for ${documentName}...`);
    let isRenamed = false;

    for (let i = 0; i < 20; i++) {
        try {
            const testRes = await axios.post(
                "https://" + AGW_BASE_URL + "/api/v3/fb/get-streamtest-result",
                { version: documentName },
                { headers: { apiKey, "Content-Type": "application/json" }, httpsAgent }
            );
            // console.log(testRes.data.data)
            if (testRes.data?.data?.uploadSystemFile?.isRenamed === true) {
                isRenamed = true;
                console.log(`[Uploader] Stream test successful ✅`);
                break;
            }
            if (testRes.data?.data?.error) {
                throw new Error(testRes.data?.data?.error);
            }
            console.log(`[Uploader] Stream test in progress... waiting 30s`);
        } catch (err) {
            if (err.response?.status !== 404) {
                throw new Error(`[Uploader] Stream test error: ${err.message}`);
            }
            console.log(`[Uploader] Stream test not ready yet (404). Retrying...`);
        }
        await new Promise(res => setTimeout(res, 30000));
    }

    if (!isRenamed) {
        console.warn(`[Uploader] Stream test did not complete within 10 minutes.`);
    }

    console.log(`[Uploader] Upload process completed for app: ${appName} (version: ${version})`);
}

module.exports = { uploadStreamingApp };
