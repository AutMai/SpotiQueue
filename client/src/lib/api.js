import axios from 'axios'
import { installDemoMock } from '@demo/installMock.js'

axios.defaults.withCredentials = true
installDemoMock(axios)

export default axios
