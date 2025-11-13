# Eagle 3D Streaming Automation Kit

![npm](https://img.shields.io/npm/v/e3ds-automation-kit)
![npm downloads](https://img.shields.io/npm/dm/e3ds-automation-kit)
![license](https://img.shields.io/npm/l/e3ds-automation-kit)

A Node.js library for doing specific tasks related to Eagle 3D Streaming in an automated procedure, thus being beneficial for usage in different scenarios like CI-CD pipeline or Unit Testing etc.

# Environment Setup
```bash
npm install e3ds-automation-kit
```

# Features

## Streaming App Uploader
* Request signed URL for file upload.
* Upload file with progress bar.
* Register uploaded exe info.
* Poll stream test result until the app is renamed or timed out.
* Retry on failures.


### Pseudo Code / Process Flow

1. Start uploadStreamingApp(fileLocation, apiKey, appName)
2. Check if file exists locally
3. Request a signed URL for the file
   -> Retry on failure up to N times
4. Upload the file using the signed URL via PUT
   -> Show progress bar
   -> Retry on failure
5. Call exe-info-upload API with:
    - appName
    - version
    - username
    - exePaths
    - appSize
6. Poll stream test API (get-streamtest-result)
    - Wait until 'isRenamed' is true or 10 minutes pass
    - Retry every 30 seconds
7. Finish process and log completion

### Usage Example

```js
const { uploadStreamingApp } = require("e3ds-automation-kit");

(async () => {
  try {
    await uploadStreamingApp(
      "./myAppBuild.zip", // Path to the local file
      "YOUR_EAGLE3D_API_KEY", // API key
      "MyStreamingApp" // App name
    );
    console.log("Upload completed successfully!");
  } catch (err) {
    console.error("Upload failed:", err.message);
  }
})();

```

### Notes

* Ensure the apiKey is valid and has permission to upload apps.
* File upload will automatically retry if network issues occur.
* Stream test polling lasts up to 10 minutes; if not renamed, a warning will be logged.
* Progress bars are displayed in the console using cli-progress.

### Example Output

```
[Uploader] Preparing upload for MyStreamingApp (50 MB / 0.05 GB)
[Uploader] Got signed URL. Version: uv-1-1759415059018
[#######...........] 50% | myAppBuild.zip | 25/50 MB
[Uploader] File upload complete.
[Uploader] stream-test invoke response: {"status":"success"}
[Uploader] Polling stream test result for MyStreamingApp_uv-1-1759415059018...
[Uploader] Stream test successful ✅
[Uploader] Upload process completed for app: MyStreamingApp (version: uv-1-1759415059018)
Upload completed successfully!
```

