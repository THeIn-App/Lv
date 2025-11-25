import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify('AIzaSyCOJY2mRpsN3h5bGrlTq5'),
    'process.env.PAYPAL_CLIENT_ID': JSON.stringify('ATMQoKLQNdHOdkwVg3JvQTDfcqDfFJUwxAafEi5yQfmo9UKlYiroxH_xVGn7iduoVFoLlNPWPv4_ZHXZ')
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['lucide-react'],
          ai: ['@google/genai'],
          payment: ['@paypal/react-paypal-js']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});