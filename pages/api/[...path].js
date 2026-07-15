import apiHandler from "../../server/api-gateway.js"

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
}

export default apiHandler
