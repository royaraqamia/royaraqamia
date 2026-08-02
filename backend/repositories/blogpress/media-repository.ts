export interface IMediaRepository {
  uploadImage(
    bucketName: string,
    fileName: string,
    file: File
  ): Promise<{ url: string } | { error: string }>;
}
