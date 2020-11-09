module.exports = {
    purge: {
        layers: ["components", "utilities"],
        content: ["./src/index.html"]
    },
    future: {
        removeDeprecatedGapUtilities: true,
        purgeLayersByDefault: true
    }
}
