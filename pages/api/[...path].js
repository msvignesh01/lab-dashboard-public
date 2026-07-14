import apiHandler from "../../api/index.js"

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
}

export default apiHandler
