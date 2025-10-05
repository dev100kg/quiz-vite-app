// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
    // ... その他の設定
    build: {
        // 最終的なビルドファイルを 'public' フォルダに出力するように設定
        outDir: 'public',
        // Vite開発時、publicフォルダ内のファイルを静的アセットとして扱う
        publicDir: 'public'
    },
    // ...
});