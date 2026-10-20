// swift-tools-version:5.9
// xtool project manifest (https://github.com/xtool-org/xtool): build and install SPAN on your own device
// from Windows (WSL) or Linux. The App Store build uses ios/project.yml (XcodeGen) instead.
// The game files are NOT in this folder: generate them first with
//   node tools/build-web-bundle.js ios/SPAN/www --platform ios
// (npm run ios:bundle). They are copied into the app as resources.
// Check this manifest against the xtool docs when you first build: xtool's expected product type
// (library vs executable) and its xtool.yml keys may have changed.
import PackageDescription

let package = Package(
    name: "SPAN",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "SPAN", targets: ["SPAN"]),
    ],
    targets: [
        .target(
            name: "SPAN",
            path: "SPAN",
            exclude: ["Assets.xcassets"],
            sources: ["Sources"],
            resources: [.copy("www")]
        ),
    ]
)
