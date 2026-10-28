// vite.config.ts
import react from "file:///D:/vibecoding-shizhan/ProofPatch/node_modules/@vitejs/plugin-react/dist/index.js";
import { defineConfig } from "file:///D:/vibecoding-shizhan/ProofPatch/node_modules/vitest/dist/config.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4321"
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.mjs"],
    css: false,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 2e4,
    hookTimeout: 2e4
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFx2aWJlY29kaW5nLXNoaXpoYW5cXFxcUHJvb2ZQYXRjaFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcdmliZWNvZGluZy1zaGl6aGFuXFxcXFByb29mUGF0Y2hcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L3ZpYmVjb2Rpbmctc2hpemhhbi9Qcm9vZlBhdGNoL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVzdC9jb25maWdcIjtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICBzZXJ2ZXI6IHtcbiAgICBwcm94eToge1xuICAgICAgXCIvYXBpXCI6IFwiaHR0cDovLzEyNy4wLjAuMTo0MzIxXCIsXG4gICAgfSxcbiAgfSxcbiAgdGVzdDoge1xuICAgIGVudmlyb25tZW50OiBcImpzZG9tXCIsXG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBzZXR1cEZpbGVzOiBcIi4vc3JjL3Rlc3Qvc2V0dXAudHNcIixcbiAgICBpbmNsdWRlOiBbXCJzcmMvKiovKi50ZXN0Lnt0cyx0c3h9XCIsIFwic2VydmVyLyoqLyoudGVzdC5tanNcIl0sXG4gICAgY3NzOiBmYWxzZSxcbiAgICBmaWxlUGFyYWxsZWxpc206IGZhbHNlLFxuICAgIG1heFdvcmtlcnM6IDEsXG4gICAgdGVzdFRpbWVvdXQ6IDIwXzAwMCxcbiAgICBob29rVGltZW91dDogMjBfMDAwLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXdSLE9BQU8sV0FBVztBQUMxUyxTQUFTLG9CQUFvQjtBQUU3QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsUUFBUTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLElBQ1Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxNQUFNO0FBQUEsSUFDSixhQUFhO0FBQUEsSUFDYixTQUFTO0FBQUEsSUFDVCxZQUFZO0FBQUEsSUFDWixTQUFTLENBQUMsMEJBQTBCLHNCQUFzQjtBQUFBLElBQzFELEtBQUs7QUFBQSxJQUNMLGlCQUFpQjtBQUFBLElBQ2pCLFlBQVk7QUFBQSxJQUNaLGFBQWE7QUFBQSxJQUNiLGFBQWE7QUFBQSxFQUNmO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
