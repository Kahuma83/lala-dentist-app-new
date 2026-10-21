import {
  deleteMessage,
  handleChatError
} from "../../../_shared/doctor-chat.js";

export const onRequestDelete = async (context) => {
  try {
    return await deleteMessage(context);
  } catch (error) {
    return handleChatError(error);
  }
};
