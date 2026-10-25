import {
  getUnreadCount,
  handleChatError,
  markDoctorChatRead
} from "../../_shared/doctor-chat.js";

export const onRequestGet = async (context) => {
  try {
    return await getUnreadCount(context);
  } catch (error) {
    return handleChatError(error);
  }
};

export const onRequestPost = async (context) => {
  try {
    return await markDoctorChatRead(context);
  } catch (error) {
    return handleChatError(error);
  }
};
