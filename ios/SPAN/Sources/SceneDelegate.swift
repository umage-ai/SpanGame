// SceneDelegate: owns the single window and the game screen (GameViewController).
// Scene lifecycle drives the game's pause/resume, the same as Android's onPause/onResume (docs/NATIVE.md).

import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private var gameController: GameViewController?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let controller = GameViewController()
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = controller
        window.makeKeyAndVisible()

        self.gameController = controller
        self.window = window
    }

    func sceneWillResignActive(_ scene: UIScene) {
        // The app is leaving the foreground: pause a running test, save, silence the audio.
        gameController?.pauseGame()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Back in front: restore the audio.
        gameController?.resumeGame()
    }
}
