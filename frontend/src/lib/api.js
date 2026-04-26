import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
});

export const extractErrorMessage = (error) => {
  return error?.response?.data?.error?.message ?? error?.message ?? "Unexpected request failure.";
};
