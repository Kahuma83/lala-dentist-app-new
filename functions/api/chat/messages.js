import {
  handleChatError,
  listMessages,
  sendMessage
} from "../../_shared/doctor-chat.js";

export const onRequestGet = async (context) => {
  try {
    return await listMessages(context);
  } catch (error) {
    return handleChatError(error);
  }
};

export const onRequestPost = async (context) => {
  try {
    return await sendMessage(context);
  } catch (error) {
    return handleChatError(error);
  }
};
