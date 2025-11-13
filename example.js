const { uploadStreamingApp } = require("./main");

(async () => {
    try {
        await uploadStreamingApp(
            "", // Path to the local file
            "", // API key
            "" // App name
        );
    } catch (err) {
        console.error("Upload failed:", err.message);
    }
})();
