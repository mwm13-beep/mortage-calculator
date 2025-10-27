import autoprefixer from 'autoprefixer'
import tailwindcssPostcss from '@tailwindcss/postcss'

export default {
  plugins: [
    tailwindcssPostcss(), // <— this wires Tailwind for v4
    autoprefixer(),
  ],
}
