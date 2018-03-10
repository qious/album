import config from 'config'

import { pathJoin, isHideFile, isImgFile } from '../lib/utils'
import upyun from './upyun'
import {
  AlbumConfig,
  GalleryImage,
  GalleryAlbumQuestions,
  GalleryAlbum,
  GalleryAlbumsObject,
  UpYunFile,
  UpYunFileType
} from '../types'

export class Gallery {
  private config: GalleryAlbumsObject

  constructor (albumConfig: AlbumConfig) {
    this.config = this.loadConfig('/', albumConfig, {})
  }

  // 通过路径获取名称
  public getNameFromPath (path: string) {
    return path.split('/').pop() || path
  }

  // 获取图集信息
  public getAlbumInfo (path: string): GalleryAlbum {
    return {
      path,
      name: this.getNameFromPath(path),
      questions: {},
      description: null,
      ...this.config[path] || {}
    }
  }

  // 获取图片列表
  public getImageInfo (path: string): GalleryImage {
    return {
      path,
      name: this.getNameFromPath(path)
    }
  }

  // 获取图集中图片列表
  public async getImages (path: string): Promise<GalleryImage[]> {
    let files: UpYunFile[] = await this.getFiles(path, this.imageFileFilter)
    return files.map((file) => this.getImageInfo(pathJoin(path, file.name)))
  }

  // 获取图集中子图集列表
  public async getAlbums (path: string): Promise<GalleryAlbum[]> {
    let files: UpYunFile[] = await this.getFiles(path, this.albumFilter)
    return files.map((file) => this.getAlbumInfo(pathJoin(path, file.name)))
  }

  // 获取缩略图
  public async getThumbnails (path: string): Promise<string[]> {
    let thumbnails: string[] = []

    // 获取用户配置的缩略图
    let albumConfig: GalleryAlbum = this.config[path]
    if (albumConfig) {
      thumbnails = albumConfig.thumbnails || []
    }

    // 未设置缩略图则通过又拍云获取
    if (!thumbnails || !thumbnails.length) {
      let files: UpYunFile[] = await this.getFiles(path, this.imageFileFilter)
      thumbnails = files.map((file) => file.name)
    }

    // 最多获取四个缩略图
    thumbnails = thumbnails.slice(0, 4)
    for (let i = 0; i < thumbnails.length; i++) {
      let thumbnailPath = pathJoin(path, thumbnails[i])
      thumbnails[i] = upyun.getThumbnailUrl(thumbnailPath)
    }

    return thumbnails
  }

  // 加在配置文件
  private loadConfig (path: string, albumConfig: AlbumConfig, parentQuestions: object): GalleryAlbumsObject {
    // 相册名称与问题
    let name = albumConfig.name || this.getNameFromPath(path)
    let questions: GalleryAlbumQuestions = { ...parentQuestions }
    if (albumConfig.question && albumConfig.answer) {
      questions[albumConfig.question] = albumConfig.answer
    }

    // 构建基础对象
    let albums: GalleryAlbumsObject = {
      [path]: {
        path,
        name,
        questions,
        description: albumConfig.description || null,
        thumbnails: albumConfig.thumbnails || []
      }
    }

    if (albumConfig.items) {
      for (let itemPath in albumConfig.items) {
        let itemFullPath = pathJoin(path, itemPath)
        let childAlbums = this.loadConfig(itemFullPath, albumConfig.items[itemPath], questions)
        Object.assign(albums, childAlbums)
      }
    }
    return albums
  }

  // 文件及文件夹排序，文件夹优先
  private sortFiles (files: UpYunFile[]): UpYunFile[] {
    files.sort((a: UpYunFile, b: UpYunFile): number => {
      if (a.type === UpYunFileType.Folder && b.type !== UpYunFileType.Folder) {
        return -1
      } else if (a.type !== UpYunFileType.Folder && b.type === UpYunFileType.Folder) {
        return 1
      }
      return a.name > b.name ? 1 : -1
    })
    return files
  }

  // 过滤图片文件
  private imageFileFilter (file: UpYunFile): boolean {
    return file.type === UpYunFileType.File && isImgFile(file.name)
  }

  // 过滤图集
  private albumFilter (file: UpYunFile): boolean {
    return file.type === UpYunFileType.Folder
  }

  // 获取所有非隐藏文件
  private async getFiles (path: string, filter: Function): Promise<UpYunFile[]> {
    let files: UpYunFile[] = await upyun.listDirWithCache(path)
    return this.sortFiles(
      files.filter((file) => !isHideFile(file.name) && filter(file))
    )
  }
}

export default new Gallery(config.get('albums'))