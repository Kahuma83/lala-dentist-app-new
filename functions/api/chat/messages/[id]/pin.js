import {
  handleChatError,
  setPinnedMessage
} from "../../../../_shared/doctor-chat.js";

export const onRequestPut = async (context) => {
  try {
    return await setPinnedMessage(context);
  } catch (error) {
    return handleChatError(error);
  }
};

export const onRequestDelete = async (context) => {
  try {
    return await setPinnedMessage(context);
  } catch (error) {
    return handleChatError(error);
  }
};
