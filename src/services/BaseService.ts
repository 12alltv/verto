import axios from 'axios';

export default class BaseService {
  static apiUrl: string;

  protected static get<T = any>(path: string) {
    return axios.get<T>(`${this.apiUrl}${path}`);
  }
}
